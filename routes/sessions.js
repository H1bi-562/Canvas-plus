// routes/sessions.js
// UC24 – study session timer: reads/writes the StudySession table
// UC12 – session history is stored here for later reporting
//
// Timing model
// ------------
// "durationSeconds" accumulates ACTIVE seconds only. The segment currently
// running goes from COALESCE("resumedAt", "startedAt") to NOW(), so pausing
// and resuming any number of times never inflates the total.
//
// Every timestamp is produced by NOW() on the database, never by the client.
// The extension's service worker can be evicted at any moment (Manifest V3),
// so the browser's clock is not a trustworthy source for elapsed time — the
// client renders from the timestamps this API returns.

const express = require('express');
const pool    = require('../db');
const auth    = require('../middleware/authMiddleware');

const router = express.Router();
router.use(auth);

// Column list returned by every endpoint. Takes a table alias because the
// history query joins Assignment, which also has an `id` — unqualified names
// would be ambiguous there.
//
// "elapsedSeconds" is the live total: banked time plus the segment still
// running, so the UI can render an accurate clock straight from the response
// without repeating the arithmetic.
function sessionFields(alias) {
  const p = alias ? `${alias}.` : '';
  const activeSegment =
    `EXTRACT(EPOCH FROM (NOW() - COALESCE(${p}"resumedAt", ${p}"startedAt")))::INTEGER`;

  return `
    ${p}id,
    ${p}"userID",
    ${p}"assignmentID",
    ${p}status,
    ${p}"startedAt",
    ${p}"pausedAt",
    ${p}"resumedAt",
    ${p}"endedAt",
    ${p}"durationSeconds",
    CASE WHEN ${p}status = 'active'
         THEN ${p}"durationSeconds" + ${activeSegment}
         ELSE ${p}"durationSeconds"
    END AS "elapsedSeconds"
  `;
}

// Unaliased forms, used by the single-table statements below.
const FIELDS         = sessionFields('');
const ACTIVE_SEGMENT = `EXTRACT(EPOCH FROM (NOW() - COALESCE("resumedAt", "startedAt")))::INTEGER`;

// ── POST /api/sessions/start ──────────────────────────────────────────────
// Opens a study session for the logged-in user.
// Body: { assignmentID? } — optional; a session need not be tied to an assignment.
router.post('/start', async (req, res) => {
  const { assignmentID } = req.body || {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // An assignment may only be attached if it belongs to this user. Checking
    // here rather than leaning on the FK keeps one user from timing against
    // another user's assignment id.
    if (assignmentID) {
      const owned = await client.query(
        `SELECT id FROM "Assignment" WHERE id = $1 AND "userID" = $2`,
        [assignmentID, req.user.id]
      );
      if (owned.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Assignment not found' });
      }
    }

    // Refuse a second timer rather than silently abandoning the first, so a
    // double-tap on Start cannot orphan a session the user is still running.
    const open = await client.query(
      `SELECT ${FIELDS} FROM "StudySession"
        WHERE "userID" = $1 AND status IN ('active', 'paused')`,
      [req.user.id]
    );
    if (open.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'A study session is already open. End it before starting another.',
        session: open.rows[0]
      });
    }

    const result = await client.query(
      `INSERT INTO "StudySession" ("userID", "assignmentID", status, "durationSeconds")
       VALUES ($1, $2, 'active', 0)
       RETURNING ${FIELDS}`,
      [req.user.id, assignmentID || null]
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);

  } catch (err) {
    await client.query('ROLLBACK');
    // 23505 = the partial unique index caught a concurrent start.
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A study session is already open.' });
    }
    // 22P02 = assignmentID in the body was not a valid UUID.
    if (err.code === '22P02') {
      return res.status(400).json({ error: 'Invalid assignment id' });
    }
    console.error('Start session error:', err.message);
    res.status(500).json({ error: 'Failed to start study session' });
  } finally {
    client.release();
  }
});

// ── PATCH /api/sessions/:id/end ───────────────────────────────────────────
// Closes the session and banks any time still running.
router.patch('/:id/end', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE "StudySession"
          SET status            = 'completed',
              "endedAt"         = NOW(),
              -- Only an active session has unbanked time; a paused one already
              -- banked its total at the moment it was paused.
              "durationSeconds" = CASE WHEN status = 'active'
                                       THEN "durationSeconds" + ${ACTIVE_SEGMENT}
                                       ELSE "durationSeconds" END,
              "pausedAt"        = NULL,
              "resumedAt"       = NULL,
              "updatedAt"       = NOW()
        WHERE id = $1 AND "userID" = $2 AND status IN ('active', 'paused')
        RETURNING ${FIELDS}`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No open study session with that id' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    // 22P02 = the id in the path was not a valid UUID.
    if (err.code === '22P02') {
      return res.status(400).json({ error: 'Invalid session id' });
    }
    console.error('End session error:', err.message);
    res.status(500).json({ error: 'Failed to end study session' });
  }
});

// ── PATCH /api/sessions/:id/pause ─────────────────────────────────────────
// Banks the running segment and stops the clock.
router.patch('/:id/pause', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE "StudySession"
          SET status            = 'paused',
              "durationSeconds" = "durationSeconds" + ${ACTIVE_SEGMENT},
              "pausedAt"        = NOW(),
              "resumedAt"       = NULL,
              "updatedAt"       = NOW()
        WHERE id = $1 AND "userID" = $2 AND status = 'active'
        RETURNING ${FIELDS}`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No active study session with that id' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '22P02') {
      return res.status(400).json({ error: 'Invalid session id' });
    }
    console.error('Pause session error:', err.message);
    res.status(500).json({ error: 'Failed to pause study session' });
  }
});

// ── PATCH /api/sessions/:id/resume ────────────────────────────────────────
// Restarts the clock. Time spent paused is never counted.
router.patch('/:id/resume', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE "StudySession"
          SET status      = 'active',
              "resumedAt" = NOW(),
              "pausedAt"  = NULL,
              "updatedAt" = NOW()
        WHERE id = $1 AND "userID" = $2 AND status = 'paused'
        RETURNING ${FIELDS}`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No paused study session with that id' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '22P02') {
      return res.status(400).json({ error: 'Invalid session id' });
    }
    console.error('Resume session error:', err.message);
    res.status(500).json({ error: 'Failed to resume study session' });
  }
});

// ── GET /api/sessions/active ──────────────────────────────────────────────
// The timer calls this on mount to rebuild its state. A Manifest V3 service
// worker is evicted after ~30s idle and the popup unmounts whenever it closes,
// so the open session on the server — not anything held in memory — is the
// source of truth for what the timer should be showing.
//
// Returns { session: null } rather than 404 when nothing is running: "no timer"
// is a normal state, not an error.
//
// Declared before GET / so the literal path is matched ahead of any
// parameterised route added later.
router.get('/active', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${FIELDS} FROM "StudySession"
        WHERE "userID" = $1 AND status IN ('active', 'paused')`,
      [req.user.id]
    );

    res.json({ session: result.rows[0] || null });
  } catch (err) {
    console.error('Get active session error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve active study session' });
  }
});

// ── GET /api/sessions ─────────────────────────────────────────────────────
// Session history, newest first. Optional ?assignmentID=uuid to filter.
router.get('/', async (req, res) => {
  const { assignmentID } = req.query;

  try {
    let query = `
      SELECT ${sessionFields('s')},
             a.title AS "assignmentTitle"
        FROM "StudySession" s
        LEFT JOIN "Assignment" a ON a.id = s."assignmentID"
       WHERE s."userID" = $1
    `;
    const params = [req.user.id];

    if (assignmentID) {
      query += ` AND s."assignmentID" = $2`;
      params.push(assignmentID);
    }

    query += ` ORDER BY s."startedAt" DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    if (err.code === '22P02') {
      return res.status(400).json({ error: 'Invalid assignment id' });
    }
    console.error('Get sessions error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve study sessions' });
  }
});

module.exports = router;
