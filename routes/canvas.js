// routes/canvas.js
// UC "Create API to connect with Canvas auth" -- Canvas LMS connection (OAuth2
// or a personal access token) and assignment sync.
//
// Mounted at /api/canvas. Every route requires our own JWT EXCEPT /callback:
// Canvas redirects the user's browser there, and a redirect carries no
// Authorization header. The user's identity travels in the signed `state`
// parameter instead (see services/canvasAuth.js).
//
//   GET    /api/canvas/authorize    -> URL to send the browser to
//   GET    /api/canvas/callback     -> Canvas redirects here with ?code&state
//   GET    /api/canvas/status       -> connection summary (never a token)
//   POST   /api/canvas/refresh      -> force a token refresh
//   POST   /api/canvas/token        -> connect with a personal access token
//   POST   /api/canvas/sync         -> pull active courses + assignments
//   DELETE /api/canvas/disconnect   -> revoke at Canvas + delete local grant

const express = require('express');
const auth    = require('../middleware/authMiddleware');
const canvas  = require('../services/canvasAuth');
const sync    = require('../services/canvasSync');

const router = express.Router();

/** Where to send the browser after the OAuth round trip finishes. */
function frontendURL() {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
}

/** Map a thrown error to a response, preserving CanvasAuthError's status. */
function fail(res, err, fallbackMessage) {
  if (err instanceof canvas.CanvasAuthError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(`${fallbackMessage}:`, err.message);
  return res.status(500).json({ error: fallbackMessage });
}

// ── GET /api/canvas/authorize ─────────────────────────────────────────────
// Returns the Canvas consent URL. The client opens it; we do not 302 here so
// that a fetch() from the SPA is not silently followed cross-origin.
// Pass ?redirect=1 to get a real 302 instead (useful for a plain <a href>).
router.get('/authorize', auth, (req, res) => {
  try {
    const state = canvas.signState(req.user.id);
    const url   = canvas.buildAuthorizeUrl(state);
    if (req.query.redirect === '1') return res.redirect(url);
    res.json({ authorizeURL: url });
  } catch (err) {
    fail(res, err, 'Failed to build the Canvas authorization URL');
  }
});

// ── GET /api/canvas/callback ──────────────────────────────────────────────
// Canvas sends the user's BROWSER here, so responses are redirects with a
// human-readable query string rather than JSON an end user would never see.
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;

  const back = (params) =>
    res.redirect(`${frontendURL()}/settings?${new URLSearchParams(params).toString()}`);

  // The user pressed "Cancel" on the Canvas consent screen, or Canvas refused.
  if (error) {
    return back({ canvas: 'error', message: errorDescription || String(error) });
  }
  if (!code || !state) {
    return back({ canvas: 'error', message: 'Canvas did not return a code. Try connecting again.' });
  }

  try {
    const userID = canvas.verifyState(state);          // also proves this is our request
    const tokens = await canvas.exchangeCodeForTokens(code);
    await canvas.saveGrant(userID, tokens);
    return back({ canvas: 'connected', name: tokens.canvasName || '' });
  } catch (err) {
    const message = err instanceof canvas.CanvasAuthError
      ? err.message
      : 'Could not complete the Canvas connection.';
    if (!(err instanceof canvas.CanvasAuthError)) {
      console.error('Canvas callback error:', err.message);
    }
    return back({ canvas: 'error', message });
  }
});

// ── GET /api/canvas/status ────────────────────────────────────────────────
router.get('/status', auth, async (req, res) => {
  try {
    res.json(await canvas.getStatus(req.user.id));
  } catch (err) {
    fail(res, err, 'Failed to read Canvas connection status');
  }
});

// ── POST /api/canvas/refresh ──────────────────────────────────────────────
// Forces a refresh now. Normal callers do not need this -- getValidAccessToken()
// refreshes on demand -- but it makes the behaviour demonstrable and testable.
router.post('/refresh', auth, async (req, res) => {
  try {
    await canvas.getValidAccessToken(req.user.id);
    res.json(await canvas.getStatus(req.user.id));
  } catch (err) {
    fail(res, err, 'Failed to refresh the Canvas token');
  }
});

// ── POST /api/canvas/token ────────────────────────────────────────────────
// Body: { token }. The token is verified with Canvas before it is stored, and is
// never echoed back -- the response is the same safe summary as /status.
router.post('/token', auth, async (req, res) => {
  try {
    res.json(await canvas.connectWithToken(req.user.id, req.body?.token));
  } catch (err) {
    fail(res, err, 'Failed to connect Canvas with that token');
  }
});

// ── POST /api/canvas/sync ─────────────────────────────────────────────────
// Imports the student's active courses and assignments. Re-running updates
// existing rows rather than duplicating them.
router.post('/sync', auth, async (req, res) => {
  try {
    res.json(await sync.syncAssignments(req.user.id));
  } catch (err) {
    fail(res, err, 'Failed to sync assignments from Canvas');
  }
});

// ── DELETE /api/canvas/disconnect ─────────────────────────────────────────
router.delete('/disconnect', auth, async (req, res) => {
  try {
    const result = await canvas.disconnect(req.user.id);
    if (!result.removed) {
      return res.status(404).json({ error: 'Canvas is not connected for this account.' });
    }
    res.json({
      message: 'Canvas disconnected.',
      // Surfaced so a failed remote revoke is visible rather than silent.
      revokedAtCanvas: result.revokedAtCanvas,
    });
  } catch (err) {
    fail(res, err, 'Failed to disconnect Canvas');
  }
});

module.exports = router;
