// services/canvasAuth.js
// Canvas LMS connection -- OAuth2 (authorization code grant) or a personal access
// token (PAT), plus the stored-token lifecycle for both.
//
// Routes stay thin; everything that knows how Canvas actually behaves lives here.
// Reference: Canvas REST API, "OAuth2 Endpoints".
//
// The function the rest of the app cares about is getValidAccessToken(userID).
// It returns a usable Canvas token and refreshes transparently when the old one
// has expired, so callers (assignment sync, calendar sync) never handle OAuth.

const axios = require('axios');
const jwt   = require('jsonwebtoken');
const pool  = require('../db');
const { encrypt, decrypt } = require('../utils/crypto');

/** Error carrying an HTTP status so routes can map failures without re-inspecting them. */
class CanvasAuthError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'CanvasAuthError';
    this.status = status;
  }
}

// ── Configuration ─────────────────────────────────────────────────────────
// Read per call, not at module load, so tests can point at a mock Canvas by
// setting env vars after this file is required.
function config() {
  const cfg = {
    baseURL:      (process.env.CANVAS_BASE_URL || '').replace(/\/+$/, ''),
    clientID:      process.env.CANVAS_CLIENT_ID,
    clientSecret:  process.env.CANVAS_CLIENT_SECRET,
    redirectURI:   process.env.CANVAS_REDIRECT_URI,
    scopes:        process.env.CANVAS_SCOPES || '',
  };
  const missing = ['baseURL', 'clientID', 'clientSecret', 'redirectURI']
    .filter((k) => !cfg[k]);
  if (missing.length) {
    const envNames = { baseURL: 'CANVAS_BASE_URL', clientID: 'CANVAS_CLIENT_ID',
                       clientSecret: 'CANVAS_CLIENT_SECRET', redirectURI: 'CANVAS_REDIRECT_URI' };
    throw new CanvasAuthError(
      `Canvas OAuth is not configured. Missing: ${missing.map((m) => envNames[m]).join(', ')}`,
      503
    );
  }
  return cfg;
}

/**
 * Just the Canvas host. A PAT connection needs nothing else -- no developer key,
 * no redirect URI -- so this must not require the OAuth variables.
 */
function canvasBaseURL() {
  const baseURL = (process.env.CANVAS_BASE_URL || '').replace(/\/+$/, '');
  if (!baseURL) {
    throw new CanvasAuthError('Canvas is not configured. Missing: CANVAS_BASE_URL', 503);
  }
  return baseURL;
}

/** True when every Canvas env var is present. Lets routes answer /status without throwing. */
function isConfigured() {
  try { config(); return true; } catch { return false; }
}

// ── The `state` parameter ─────────────────────────────────────────────────
// Canvas redirects the browser to our callback with no Authorization header, so
// the callback cannot identify the user from the request itself. We therefore
// make `state` a short-lived signed JWT carrying the user id: it defeats CSRF
// (an attacker cannot forge our signature) AND carries identity, which avoids a
// server-side state table. Ten minutes is long enough to approve a consent
// screen and short enough that a leaked URL is near-useless.
const STATE_TTL = '10m';
const STATE_PURPOSE = 'canvas_oauth_state';

function signState(userID) {
  return jwt.sign({ uid: userID, purpose: STATE_PURPOSE }, process.env.JWT_SECRET, {
    expiresIn: STATE_TTL,
  });
}

function verifyState(state) {
  let decoded;
  try {
    decoded = jwt.verify(state, process.env.JWT_SECRET);
  } catch {
    throw new CanvasAuthError('Invalid or expired OAuth state. Start the connection again.', 400);
  }
  // A JWT signed by us for a different purpose (e.g. a login token) must not be
  // accepted here, or a stolen session token could stand in for consent.
  if (decoded.purpose !== STATE_PURPOSE || !decoded.uid) {
    throw new CanvasAuthError('OAuth state is not valid for this flow.', 400);
  }
  return decoded.uid;
}

// ── Canvas protocol ───────────────────────────────────────────────────────

/** The URL to send the user's browser to so they can approve access. */
function buildAuthorizeUrl(state) {
  const cfg = config();
  const params = new URLSearchParams({
    client_id:     cfg.clientID,
    response_type: 'code',
    redirect_uri:  cfg.redirectURI,
    state,
  });
  if (cfg.scopes) params.set('scope', cfg.scopes);
  return `${cfg.baseURL}/login/oauth2/auth?${params.toString()}`;
}

/** Turn a Canvas error body into something readable instead of "[object Object]". */
function describeCanvasError(err, fallback) {
  const body = err.response?.data;
  const detail = body?.error_description || body?.error || body?.message;
  const status = err.response?.status;
  if (detail) return `${fallback}: ${detail}`;
  if (status)  return `${fallback} (Canvas returned HTTP ${status})`;
  return `${fallback}: ${err.message}`;
}

/** Exchange the one-time ?code= from the callback for tokens. */
async function exchangeCodeForTokens(code) {
  const cfg = config();
  try {
    const { data } = await axios.post(`${cfg.baseURL}/login/oauth2/token`, {
      grant_type:    'authorization_code',
      client_id:     cfg.clientID,
      client_secret: cfg.clientSecret,
      redirect_uri:  cfg.redirectURI,
      code,
    }, { timeout: 15000 });

    if (!data?.access_token) {
      throw new CanvasAuthError('Canvas did not return an access token.', 502);
    }
    return {
      accessToken:  data.access_token,
      refreshToken: data.refresh_token || null,
      expiresIn:    data.expires_in ?? null,
      scope:        data.scope || null,
      canvasUserID: data.user?.id != null ? String(data.user.id) : null,
      canvasName:   data.user?.name || null,
    };
  } catch (err) {
    if (err instanceof CanvasAuthError) throw err;
    throw new CanvasAuthError(describeCanvasError(err, 'Canvas token exchange failed'), 502);
  }
}

/** Trade a refresh token for a fresh access token. Canvas refresh tokens do not expire. */
async function refreshAccessToken(refreshToken) {
  const cfg = config();
  try {
    const { data } = await axios.post(`${cfg.baseURL}/login/oauth2/token`, {
      grant_type:    'refresh_token',
      client_id:     cfg.clientID,
      client_secret: cfg.clientSecret,
      refresh_token: refreshToken,
    }, { timeout: 15000 });

    if (!data?.access_token) {
      throw new CanvasAuthError('Canvas did not return an access token on refresh.', 502);
    }
    return {
      accessToken: data.access_token,
      expiresIn:   data.expires_in ?? null,
      // Canvas usually omits refresh_token on refresh; keep the old one when so.
      refreshToken: data.refresh_token || null,
    };
  } catch (err) {
    if (err instanceof CanvasAuthError) throw err;
    throw new CanvasAuthError(describeCanvasError(err, 'Canvas token refresh failed'), 502);
  }
}

/** Ask Canvas to invalidate a token. Best effort: local rows are removed regardless. */
async function revokeToken(accessToken) {
  await axios.delete(`${canvasBaseURL()}/login/oauth2/token`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000,
  });
}

// ── Persistence & token lifecycle ─────────────────────────────────────────
// Tokens are encrypted before they touch the database and decrypted only to be
// handed to Canvas. No function below returns a token to an HTTP response.

/** Seconds of headroom: refresh slightly early so a token cannot expire mid-request. */
const REFRESH_SKEW_MS = 60 * 1000;

function expiryFromNow(expiresIn) {
  if (expiresIn == null) return null;
  return new Date(Date.now() + Number(expiresIn) * 1000);
}

/** Insert or replace this user's Canvas grant. One row per user (UNIQUE on userID). */
async function saveGrant(userID, tokens) {
  const cfg = config();
  const result = await pool.query(
    `INSERT INTO "CanvasAuth"
       ("userID", "canvasBaseURL", "canvasUserID", "canvasName",
        "accessToken", "refreshToken", "expiresAt", scope)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT ("userID") DO UPDATE SET
       "canvasBaseURL" = EXCLUDED."canvasBaseURL",
       "canvasUserID"  = EXCLUDED."canvasUserID",
       "canvasName"    = EXCLUDED."canvasName",
       "accessToken"   = EXCLUDED."accessToken",
       "refreshToken"  = COALESCE(EXCLUDED."refreshToken", "CanvasAuth"."refreshToken"),
       "expiresAt"     = EXCLUDED."expiresAt",
       scope           = EXCLUDED.scope,
       "updatedAt"     = NOW()
     RETURNING id`,
    [
      userID,
      cfg.baseURL,
      tokens.canvasUserID,
      tokens.canvasName,
      encrypt(tokens.accessToken),
      encrypt(tokens.refreshToken),
      expiryFromNow(tokens.expiresIn),
      tokens.scope,
    ]
  );
  return result.rows[0].id;
}

/** The raw row, ciphertext included. Internal use only -- never send this to a client. */
async function loadGrant(userID) {
  const result = await pool.query(
    `SELECT * FROM "CanvasAuth" WHERE "userID" = $1`,
    [userID]
  );
  return result.rows[0] || null;
}

// ── Personal access tokens ────────────────────────────────────────────────
// CSULB IT may enable student-generated PATs instead of issuing a developer key.
// The student pastes the token once; we prove it works against Canvas before
// storing it, so a typo fails here rather than on the first sync.

const MAX_TOKEN_LENGTH = 512;

/** Verify a pasted PAT with Canvas and store it, replacing any existing grant. */
async function connectWithToken(userID, rawToken) {
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';
  if (!token) {
    throw new CanvasAuthError('Paste your Canvas access token.', 400);
  }
  if (token.length > MAX_TOKEN_LENGTH || /\s/.test(token)) {
    throw new CanvasAuthError('That does not look like a Canvas access token.', 400);
  }

  const baseURL = canvasBaseURL();
  let me;
  try {
    ({ data: me } = await axios.get(`${baseURL}/api/v1/users/self`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    }));
  } catch (err) {
    if (err.response?.status === 401) {
      // 400, not 401: our API's 401 means the Canvas-Plus session itself ended.
      throw new CanvasAuthError(
        'Canvas rejected that token. Check it was copied in full and has not expired.', 400
      );
    }
    throw new CanvasAuthError(describeCanvasError(err, 'Could not verify the token with Canvas'), 502);
  }

  // A PAT has no refresh token, and Canvas does not report its expiry, so both
  // are cleared explicitly -- a leftover OAuth refresh token must not linger.
  await pool.query(
    `INSERT INTO "CanvasAuth"
       ("userID", "authType", "canvasBaseURL", "canvasUserID", "canvasName",
        "accessToken", "refreshToken", "expiresAt", scope)
     VALUES ($1, 'pat', $2, $3, $4, $5, NULL, NULL, NULL)
     ON CONFLICT ("userID") DO UPDATE SET
       "authType"      = 'pat',
       "canvasBaseURL" = EXCLUDED."canvasBaseURL",
       "canvasUserID"  = EXCLUDED."canvasUserID",
       "canvasName"    = EXCLUDED."canvasName",
       "accessToken"   = EXCLUDED."accessToken",
       "refreshToken"  = NULL,
       "expiresAt"     = NULL,
       scope           = NULL,
       "connectedAt"   = NOW(),
       "updatedAt"     = NOW()`,
    [
      userID,
      baseURL,
      me?.id != null ? String(me.id) : null,
      me?.name || null,
      encrypt(token),
    ]
  );

  return getStatus(userID);
}

/** Safe connection summary for the UI. Contains no secrets. */
async function getStatus(userID) {
  const row = await loadGrant(userID);
  if (!row) {
    return { connected: false, configured: isConfigured() };
  }
  return {
    connected:     true,
    configured:    isConfigured(),
    authType:      row.authType,
    canvasBaseURL: row.canvasBaseURL,
    canvasUserID:  row.canvasUserID,
    canvasName:    row.canvasName,
    scope:         row.scope,
    expiresAt:     row.expiresAt,
    connectedAt:   row.connectedAt,
    // Whether the stored access token is past its expiry right now. The next
    // call to getValidAccessToken() will refresh it; this is for display only.
    expired:       row.expiresAt ? new Date(row.expiresAt).getTime() <= Date.now() : false,
  };
}

/**
 * A Canvas access token that is valid right now, refreshing if needed.
 * This is the entry point for every other feature that talks to Canvas.
 */
async function getValidAccessToken(userID) {
  const row = await loadGrant(userID);
  if (!row) {
    throw new CanvasAuthError('Canvas is not connected for this account.', 404);
  }

  // A PAT does not expire on a schedule we know about and cannot be refreshed.
  // If the student deleted it in Canvas, the next Canvas call reports that.
  if (row.authType === 'pat') {
    return decrypt(row.accessToken);
  }

  const stillValid =
    row.expiresAt && new Date(row.expiresAt).getTime() - Date.now() > REFRESH_SKEW_MS;

  // No expiry recorded means a token Canvas did not scope in time; treat as valid.
  if (stillValid || !row.expiresAt) {
    return decrypt(row.accessToken);
  }

  if (!row.refreshToken) {
    throw new CanvasAuthError(
      'Canvas access expired and no refresh token is stored. Reconnect your Canvas account.',
      // 409, not 401: the UI treats our 401 as "your Canvas-Plus session ended".
      409
    );
  }

  const refreshed = await refreshAccessToken(decrypt(row.refreshToken));

  await pool.query(
    `UPDATE "CanvasAuth"
        SET "accessToken"  = $1,
            "refreshToken" = COALESCE($2, "refreshToken"),
            "expiresAt"    = $3,
            "updatedAt"    = NOW()
      WHERE "userID" = $4`,
    [
      encrypt(refreshed.accessToken),
      encrypt(refreshed.refreshToken),
      expiryFromNow(refreshed.expiresIn),
      userID,
    ]
  );

  return refreshed.accessToken;
}

/**
 * Drop this user's Canvas connection. Revocation at Canvas is attempted first but
 * a failure there must not strand the row locally -- the user asked to disconnect,
 * so the local grant goes away either way.
 */
async function disconnect(userID) {
  const row = await loadGrant(userID);
  if (!row) return { revokedAtCanvas: false, removed: false };

  // A PAT belongs to the student, who created it in Canvas and may use it
  // elsewhere; deleting it remotely is their call, not ours.
  let revokedAtCanvas = false;
  if (row.authType !== 'pat') {
    try {
      await revokeToken(decrypt(row.accessToken));
      revokedAtCanvas = true;
    } catch (err) {
      console.error('Canvas token revoke failed (removing local grant anyway):', err.message);
    }
  }

  await pool.query(`DELETE FROM "CanvasAuth" WHERE "userID" = $1`, [userID]);
  return { revokedAtCanvas, removed: true };
}

module.exports = {
  CanvasAuthError,
  config,
  canvasBaseURL,
  isConfigured,
  signState,
  verifyState,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  revokeToken,
  saveGrant,
  loadGrant,
  connectWithToken,
  getStatus,
  getValidAccessToken,
  disconnect,
};
