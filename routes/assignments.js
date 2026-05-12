// routes/assignments.js
// UC12  – reads/writes: Course, Assignment, AssignmentDetail tables
// UC2   – assignments are stored here after Canvas sync
// UC10  – AI subtasks stored in AssignmentDetail
// UC13  – AI summary stored in AssignmentDetail

const express = require('express');
const pool    = require('../db');
const auth    = require('../middleware/authMiddleware');

const router = express.Router();
router.use(auth);

// ── GET /api/assignments ──────────────────────────────────────────────────
// Returns all assignments for the logged-in user, joined with AI details.
// Optional query param: ?courseID=uuid to filter by course
router.get('/', async (req, res) => {
  const { courseID } = req.query;

  try {
    let query = `
      SELECT
        a.id,
        a.title,
        a.description,
        a.points,
        a."dueAt",
        a."availableUntil",
        a."courseID",
        c.name         AS "courseName",
        c.department,
        ad.summary,
        ad.subtasks,
        ad."priorityScore"
      FROM "Assignment" a
      JOIN "Course" c ON c.id = a."courseID"
      LEFT JOIN "AssignmentDetail" ad ON ad."assignmentID" = a.id
      WHERE a."userID" = $1
    `;
    const params = [req.user.id];

    if (courseID) {
      query += ` AND a."courseID" = $2`;
      params.push(courseID);
    }

    query += ` ORDER BY a."dueAt" ASC NULLS LAST`;

    const result = await pool.query(query, params);
    res.json(result.rows);

  } catch (err) {
    console.error('Get assignments error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve assignments' });
  }
});

// ── GET /api/assignments/:id ──────────────────────────────────────────────
// Returns a single assignment with its AI details and calendar events.
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        a.*,
        c.name          AS "courseName",
        c.department,
        c.grade,
        ad.summary,
        ad.subtasks,
        ad."priorityScore"
       FROM "Assignment" a
       JOIN "Course" c ON c.id = a."courseID"
       LEFT JOIN "AssignmentDetail" ad ON ad."assignmentID" = a.id
       WHERE a.id = $1 AND a."userID" = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get assignment error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve assignment' });
  }
});

// ── POST /api/assignments ─────────────────────────────────────────────────
// Stores a new assignment (called by the Canvas sync service).
// Also upserts the Course row if it doesn't exist yet.
// Body: { title, description, points, dueAt, availableUntil,
//         courseID, courseName, department, grade, semester }
router.post('/', async (req, res) => {
  const {
    title, description, points, dueAt, availableUntil,
    courseID, courseName, department, grade, semester
  } = req.body;

  if (!title || !courseID || !courseName) {
    return res.status(400).json({ error: 'title, courseID, and courseName are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert Course so we don't create duplicates on repeated syncs (UC12)
    await client.query(
      `INSERT INTO "Course" (id, name, department, grade, semester)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name       = EXCLUDED.name,
         department = EXCLUDED.department,
         grade      = EXCLUDED.grade,
         semester   = EXCLUDED.semester,
         "updated_at" = NOW()`,
      [courseID, courseName, department || null, grade || null, semester || null]
    );

    // Insert Assignment (UC12 – data storage)
    const assignResult = await client.query(
      `INSERT INTO "Assignment"
         ("userID", "courseID", title, description, points, "dueAt", "availableUntil")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, courseID, title, description || null,
       points || null, dueAt || null, availableUntil || null]
    );

    await client.query('COMMIT');
    res.status(201).json(assignResult.rows[0]);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create assignment error:', err.message);
    res.status(500).json({ error: 'Failed to store assignment' });
  } finally {
    client.release();
  }
});

// ── PUT /api/assignments/:id/details ─────────────────────────────────────
// Stores or updates AI-generated content for an assignment.
// Called after the Anthropic API returns a summary, subtasks, or grade impact.
// Body: { summary, subtasks, priorityScore }
router.put('/:id/details', async (req, res) => {
  const { summary, subtasks, priorityScore } = req.body;

  try {
    // Verify the assignment belongs to this user first
    const check = await pool.query(
      `SELECT id FROM "Assignment" WHERE id = $1 AND "userID" = $2`,
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Upsert AssignmentDetail (UC12 – AI content storage)
    const result = await pool.query(
      `INSERT INTO "AssignmentDetail" ("assignmentID", summary, subtasks, "priorityScore")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("assignmentID")
       DO UPDATE SET
         summary       = COALESCE($2, "AssignmentDetail".summary),
         subtasks      = COALESCE($3, "AssignmentDetail".subtasks),
         "priorityScore" = COALESCE($4, "AssignmentDetail"."priorityScore")
       RETURNING *`,
      [req.params.id,
       summary || null,
       subtasks ? JSON.stringify(subtasks) : null,
       priorityScore || null]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update assignment details error:', err.message);
    res.status(500).json({ error: 'Failed to save assignment details' });
  }
});

// ── DELETE /api/assignments/:id ───────────────────────────────────────────
// Deletes an assignment. AssignmentDetail + CalendarEvents cascade automatically.
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM "Assignment" WHERE id = $1 AND "userID" = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json({ message: 'Assignment deleted', id: result.rows[0].id });
  } catch (err) {
    console.error('Delete assignment error:', err.message);
    res.status(500).json({ error: 'Failed to delete assignment' });
  }
});

module.exports = router;