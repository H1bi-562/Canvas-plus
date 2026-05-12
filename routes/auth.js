// routes/auth.js
// UC12 – writes to: User, Config
// UC4  – JWT token issued on login

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../db');

const router = express.Router();

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

    await client.query('COMMIT');

    // Issue JWT so user is logged in immediately after registering
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user: { id: user.id, email: user.email } });

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

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, email: user.email } });

  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;