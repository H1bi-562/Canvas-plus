// test/canvasAuth.test.js
// Covers the Canvas OAuth2 connection: protocol, the signed `state` parameter,
// and the stored-token lifecycle. Runs against test/mockCanvas.js, so no Canvas
// instance or developer key is needed.
//
//   npm test
//
// The lifecycle block touches the real database (there is no separate test DB
// on this project). It creates one user with an @example.invalid address and
// deletes it afterwards, so nothing is left behind.

require('dotenv').config();

const test   = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { createMockCanvas, CLIENT_ID, CLIENT_SECRET } = require('./mockCanvas');

// A key for this run only; never reuse a production key in tests.
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const canvas = require('../services/canvasAuth');
const pool   = require('../db');

/** Point the service at the mock and hand back a teardown. */
async function withMockCanvas(opts) {
  const mock = await createMockCanvas(opts).start();
  process.env.CANVAS_BASE_URL      = mock.baseURL;
  process.env.CANVAS_CLIENT_ID     = CLIENT_ID;
  process.env.CANVAS_CLIENT_SECRET = CLIENT_SECRET;
  process.env.CANVAS_REDIRECT_URI  = 'http://localhost:3000/api/canvas/callback';
  return mock;
}

/** Drive the mock's consent screen and return the ?code it issues. */
async function getAuthorizationCode(mock, state = 'st') {
  const url = canvas.buildAuthorizeUrl(state);
  const res = await fetch(url, { redirect: 'manual' });
  const location = res.headers.get('location');
  return new URL(location).searchParams.get('code');
}

// ── Protocol ──────────────────────────────────────────────────────────────

test('exchanges an authorization code for tokens and Canvas identity', async (t) => {
  const mock = await withMockCanvas();
  t.after(() => mock.close());

  const tokens = await canvas.exchangeCodeForTokens(await getAuthorizationCode(mock));

  assert.ok(tokens.accessToken, 'access token returned');
  assert.ok(tokens.refreshToken, 'refresh token returned');
  assert.equal(tokens.canvasUserID, '4242');
  assert.equal(tokens.canvasName, 'Test Student');
  assert.equal(tokens.expiresIn, 3600);
});

test('rejects an authorization code Canvas never issued', async (t) => {
  const mock = await withMockCanvas();
  t.after(() => mock.close());

  await assert.rejects(
    () => canvas.exchangeCodeForTokens('not-a-real-code'),
    (err) => err instanceof canvas.CanvasAuthError && /unknown code/i.test(err.message)
  );
});

test('rejects a reused authorization code', async (t) => {
  const mock = await withMockCanvas();
  t.after(() => mock.close());

  const code = await getAuthorizationCode(mock);
  await canvas.exchangeCodeForTokens(code);

  await assert.rejects(
    () => canvas.exchangeCodeForTokens(code),
    (err) => /already used/i.test(err.message)
  );
});

test('rejects a wrong client secret', async (t) => {
  const mock = await withMockCanvas();
  t.after(() => mock.close());

  const code = await getAuthorizationCode(mock);
  process.env.CANVAS_CLIENT_SECRET = 'wrong-secret';

  await assert.rejects(
    () => canvas.exchangeCodeForTokens(code),
    (err) => err.status === 502 && /bad credentials/i.test(err.message)
  );
});

test('refreshes an access token', async (t) => {
  const mock = await withMockCanvas();
  t.after(() => mock.close());

  const first     = await canvas.exchangeCodeForTokens(await getAuthorizationCode(mock));
  const refreshed = await canvas.refreshAccessToken(first.refreshToken);

  assert.ok(refreshed.accessToken);
  assert.notEqual(refreshed.accessToken, first.accessToken, 'a new token is issued');
});

test('reports a clear error when Canvas is not configured', async () => {
  const saved = process.env.CANVAS_CLIENT_ID;
  delete process.env.CANVAS_CLIENT_ID;
  try {
    assert.equal(canvas.isConfigured(), false);
    assert.throws(() => canvas.config(), /CANVAS_CLIENT_ID/);
  } finally {
    process.env.CANVAS_CLIENT_ID = saved;
  }
});

// ── The `state` parameter ─────────────────────────────────────────────────

test('state round-trips the user id', () => {
  const userID = crypto.randomUUID();
  assert.equal(canvas.verifyState(canvas.signState(userID)), userID);
});

test('rejects tampered state', () => {
  const state = canvas.signState(crypto.randomUUID());
  assert.throws(
    () => canvas.verifyState(`${state.slice(0, -3)}AAA`),
    (err) => err.status === 400
  );
});

test('rejects a JWT signed for a different purpose', () => {
  // A stolen login token must not be usable as OAuth consent.
  const loginToken = require('jsonwebtoken')
    .sign({ id: crypto.randomUUID(), jti: crypto.randomUUID() }, process.env.JWT_SECRET);

  assert.throws(
    () => canvas.verifyState(loginToken),
    (err) => err.status === 400 && /not valid for this flow/i.test(err.message)
  );
});

// ── Stored-token lifecycle (touches the database) ─────────────────────────

test('token lifecycle', async (t) => {
  const mock = await withMockCanvas();
  const email = `canvastest+${Date.now()}@example.invalid`;

  const { rows } = await pool.query(
    `INSERT INTO "User" (email, "hashedPassword") VALUES ($1, 'x') RETURNING id`,
    [email]
  );
  const userID = rows[0].id;

  t.after(async () => {
    await pool.query(`DELETE FROM "User" WHERE id = $1`, [userID]);
    await mock.close();
    await pool.end();
  });

  await t.test('stores tokens encrypted, never in plaintext', async () => {
    const tokens = await canvas.exchangeCodeForTokens(await getAuthorizationCode(mock));
    await canvas.saveGrant(userID, tokens);

    const row = await canvas.loadGrant(userID);
    assert.notEqual(row.accessToken, tokens.accessToken, 'ciphertext differs from plaintext');
    assert.ok(!row.accessToken.includes(tokens.accessToken), 'plaintext not embedded');
    assert.match(row.accessToken, /^[^:]+:[^:]+:[^:]+$/, 'iv:tag:ciphertext layout');
    assert.equal(row.canvasName, 'Test Student');
  });

  await t.test('status reports the connection and leaks no token', async () => {
    const status = await canvas.getStatus(userID);
    assert.equal(status.connected, true);
    assert.equal(status.canvasName, 'Test Student');

    const serialized = JSON.stringify(status);
    assert.ok(!/access-/.test(serialized), 'no access token in status');
    assert.ok(!/refresh-/.test(serialized), 'no refresh token in status');
  });

  await t.test('returns the stored token while it is still fresh', async () => {
    const before = mock.state.refreshCalls;
    const token  = await canvas.getValidAccessToken(userID);
    assert.ok(token.startsWith('access-'));
    assert.equal(mock.state.refreshCalls, before, 'did not refresh unnecessarily');
  });

  await t.test('refreshes automatically once the token has expired', async () => {
    // Force expiry rather than waiting an hour.
    await pool.query(
      `UPDATE "CanvasAuth" SET "expiresAt" = NOW() - INTERVAL '1 minute' WHERE "userID" = $1`,
      [userID]
    );

    const before = mock.state.refreshCalls;
    const token  = await canvas.getValidAccessToken(userID);

    assert.equal(mock.state.refreshCalls, before + 1, 'refresh was performed');

    const row = await canvas.loadGrant(userID);
    assert.ok(new Date(row.expiresAt).getTime() > Date.now(), 'expiry moved into the future');

    // The refreshed token must be the one usable against Canvas.
    const probe = await fetch(`${mock.baseURL}/api/v1/users/self`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(probe.status, 200, 'refreshed token is accepted by Canvas');
  });

  await t.test('disconnect revokes at Canvas and removes the row', async () => {
    const result = await canvas.disconnect(userID);
    assert.equal(result.removed, true);
    assert.equal(result.revokedAtCanvas, true);
    assert.equal(mock.state.revoked.length, 1);
    assert.equal(await canvas.loadGrant(userID), null);

    const status = await canvas.getStatus(userID);
    assert.equal(status.connected, false);
  });

  await t.test('getValidAccessToken fails clearly when not connected', async () => {
    await assert.rejects(
      () => canvas.getValidAccessToken(userID),
      (err) => err.status === 404 && /not connected/i.test(err.message)
    );
  });
});
