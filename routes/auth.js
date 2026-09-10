// routes/auth.js
// UC12 – writes to: User, Config
// UC4  – JWT token issued on login

const express = require('express');
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../db');
const axios   = require('axios');
const auth    = require('../middleware/authMiddleware');

const router = express.Router();

//Keep in sync with "expiresIn: '7d'" passed to jwt.sign() below
//Used as the Token row's expiry
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 Days in milliseconds

// UC4 – options for the httpOnly cookie the JWT is stored in
// httpOnly: browser JS can't read it (blocks XSS token theft)
// secure:  https-only in prod; must be false on http://localhost or the browser drops it
const COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge:   TOKEN_TTL_MS,
};


//Signs JWT for "user" and records in Token table so it can be looked up later
//or revoked.
//expose .query() so that this can work inside or not of a transaction
async function issueToken(queryable, user) {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const token = jwt.sign(
    { id: user.id, email: user.email, jti },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  // either pg pool or transaction client (both)
  await queryable.query(
    'INSERT INTO "Token" (jti, "userID", "expiresAt") VALUES ($1, $2, $3)',
    [jti, user.id, expiresAt]
  );

  return token;
}



// ── POST /api/auth/register ───────────────────────────────────────────────
// Creates a new User row and an empty Config row linked to them.
// Body: { email, password }
router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  // Use a transaction so User + Config are created together or not at all
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Hash password before storing — never store plaintext
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into User table (UC12 – data storage)
    const userResult = await client.query(
      `INSERT INTO "User" (email, "hashedPassword")
       VALUES ($1, $2)
       RETURNING id, email, "createdAt"`,
      [email, hashedPassword]
    );
    const user = userResult.rows[0];

    // Insert empty Config row linked to this user (UC12 – data storage)
    // Canvas/Google/AI keys will be filled in later via /api/config
    await client.query(
      `INSERT INTO "Config" ("userID") VALUES ($1)`,
      [user.id]
    );

    //Issue JWT inside the same transaction so the Token rolls the registration instead
    //of leaving user with untracked token if the transaction fails
    const token = await issueToken(client, user);

    await client.query('COMMIT');

    res
      .cookie('token', token, COOKIE_OPTS)   // UC4 – JWT stored in httpOnly cookie
      .status(201)
      .json({ user: { id: user.id, email: user.email } });

  } catch (err) {
    await client.query('ROLLBACK');
    // Duplicate email = 23505 unique violation
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  } finally {
    client.release();
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────
// Body: { email, password }
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await pool.query(
      `SELECT id, email, "hashedPassword" FROM "User" WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.hashedPassword);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = await issueToken(pool, user);

    res
      .cookie('token', token, COOKIE_OPTS)   // UC4 – JWT stored in httpOnly cookie
      .json({ user: { id: user.id, email: user.email } });

  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// -- POST /api/auth/logout --------------------
// Revokes the JWT that authenticated the request even if token is still valid
// Runs through authMiddleware same as other route, req.user.jti is set
router.post('/logout', auth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE "Token" SET revoked = TRUE, "revokedAt" = NOW() WHERE jti = $1',
      [req.user.jti]
    );
    res.clearCookie('token', COOKIE_OPTS);   // UC4 – remove the httpOnly cookie
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err.message);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// -- GET /api/auth/canvas/callback --------------------
const CANVAS_REDIRECT_URI = 'http://localhost:3000/api/auth/canvas/callback';

router.get('/canvas/callback', async (req, res) => {
  const {code, error } = req.query;

  if (error) return res.status(400).json({ error: 'User denied access' });
  if (!code) return res.status(400).json({ error: 'Missing authorization code' });

  try {
    const tokenResponse = await axios.post(`https://canvas.instructure.com/login/oauth2/token`, null, {
      params: {
        grant_type: 'authorization_code',
        client_id: process.env.CANVAS_CLIENT_ID,
        client_secret: process.env.CANVAS_CLIENT_SECRET,
        redirect_uri: CANVAS_REDIRECT_URI,
        code: code
      }
    });
    const { access_token, refresh_token } = tokenResponse.data;

    // Tokens will be saved to the database here later

    res.redirect('http://localhost:3000/dashboard?canvas_sync=success');
  } catch (err) {
    console.error('Canvas token error:', err.message);
    res.status(500).json({ error: 'Failed to authenticate with Canvas' });
  }
});

module.exports = router; 
