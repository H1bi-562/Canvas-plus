// routes/calendar.js
// UC12 – reads/writes the CalendarEvent table
// UC3  – events are stored here after Google Calendar sync
// UC17 – study blocks created by the smart scheduler are stored here

const express = require('express');
const pool    = require('../db');
const auth    = require('../middleware/authMiddleware');

const router = express.Router();
router.use(auth);

// ── GET /api/calendar ─────────────────────────────────────────────────────
// Returns all calendar events for the logged-in user.
// Optional query params: ?month=2026-05 to filter by month
router.get('/', async (req, res) => {
  const { month } = req.query; // e.g. "2026-05"

  try {
    let query = `
      SELECT
        ce.id,
        ce.title,
        ce.calendar,
        ce."eventStart",
        ce."eventEnd",
        ce."assignmentID",
        a.title         AS "assignmentTitle",
        a.points,
        ad."priorityScore"
      FROM "CalendarEvent" ce
      JOIN "Assignment" a ON a.id = ce."assignmentID"
      LEFT JOIN "AssignmentDetail" ad ON ad."assignmentID" = a.id
      WHERE a."userID" = $1
    `;
    const params = [req.user.id];

    if (month) {
      // Filter to events starting within the given month
      query += ` AND TO_CHAR(ce."eventStart", 'YYYY-MM') = $2`;
      params.push(month);
    }

    query += ` ORDER BY ce."eventStart" ASC`;

    const result = await pool.query(query, params);
    res.json(result.rows);

  } catch (err) {
    console.error('Get calendar events error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve calendar events' });
  }
});

// ── POST /api/calendar ────────────────────────────────────────────────────
// Stores a new calendar event / study block (called after Google Calendar sync).
// Body: { assignmentID, title, calendar, eventStart, eventEnd }
router.post('/', async (req, res) => {
  const { assignmentID, title, calendar, eventStart, eventEnd } = req.body;

  if (!assignmentID || !eventStart || !eventEnd) {
    return res.status(400).json({ error: 'assignmentID, eventStart, and eventEnd are required' });
  }

  try {
    // Verify the assignment belongs to this user
    const check = await pool.query(
      `SELECT id FROM "Assignment" WHERE id = $1 AND "userID" = $2`,
      [assignmentID, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Insert CalendarEvent (UC12 – data storage)
    const result = await pool.query(
      `INSERT INTO "CalendarEvent" ("assignmentID", title, calendar, "eventStart", "eventEnd")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [assignmentID, title || null, calendar || 'primary', eventStart, eventEnd]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create calendar event error:', err.message);
    res.status(500).json({ error: 'Failed to store calendar event' });
  }
});

// ── DELETE /api/calendar/:id ──────────────────────────────────────────────
// Removes a calendar event (e.g. when a study block is cancelled).
router.delete('/:id', async (req, res) => {
  try {
    // Join through Assignment to verify ownership
    const result = await pool.query(
      `DELETE FROM "CalendarEvent" ce
       USING "Assignment" a
       WHERE ce.id = $1
         AND ce."assignmentID" = a.id
         AND a."userID" = $2
       RETURNING ce.id`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Calendar event not found' });
    }

    res.json({ message: 'Event deleted', id: result.rows[0].id });
  } catch (err) {
    console.error('Delete calendar event error:', err.message);
    res.status(500).json({ error: 'Failed to delete calendar event' });
  }
});

module.exports = router;