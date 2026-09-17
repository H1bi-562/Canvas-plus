// services/assignmentProgress.js
// The two analytics inputs a student controls -- a time estimate and "Mark done" --
// and the single completion status the UI and UC21 analytics read.
//
// Completion has two sources kept in separate columns (see 006_analytics_inputs.sql):
// Canvas's submission, refreshed on every sync, and the student's own completedAt,
// which sync never touches. completionStatus() is the one place they are combined.

const pool = require('../db');

/** Error carrying an HTTP status so routes can map failures without re-inspecting them. */
class ProgressError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'ProgressError';
    this.status = status;
  }
}

// Mirrors the CHECK constraint on "AssignmentDetail"."estimatedMinutes".
const MAX_ESTIMATE_MINUTES = 6000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One status per assignment, in priority order:
 *   excused   -- the instructor waived it
 *   submitted -- Canvas has an on-time submission (or a grade with no online submission)
 *   done      -- the student marked it done on or before the due date
 *   late      -- submitted or marked done after the due date
 *   missing   -- Canvas flags it missing and the student has not marked it done
 *   overdue   -- past due, nothing recorded anywhere
 *   pending   -- not due yet (or no due date), nothing recorded
 *
 * "Mark done" deliberately beats Canvas's missing flag: a paper quiz handed in
 * class is missing to Canvas but finished to the student.
 */
function completionStatus(row, now = Date.now()) {
  const due = row.dueAt ? new Date(row.dueAt).getTime() : null;

  if (row.excused) return 'excused';

  const canvasSubmitted =
    Boolean(row.submittedAt) || (row.submissionState === 'graded' && !row.missing);
  if (canvasSubmitted) return row.late ? 'late' : 'submitted';

  if (row.completedAt) {
    return due !== null && new Date(row.completedAt).getTime() > due ? 'late' : 'done';
  }

  if (row.missing) return 'missing';
  if (due !== null && due < now) return 'overdue';
  return 'pending';
}

/** Confirm the assignment exists and belongs to this student. 404 otherwise, never 403. */
async function assertOwned(client, userID, assignmentID) {
  // A malformed id would make Postgres throw 22P02; to the caller it is simply not found.
  if (typeof assignmentID !== 'string' || !UUID.test(assignmentID)) {
    throw new ProgressError('Assignment not found.', 404);
  }
  const { rows } = await client.query(
    `SELECT id FROM "Assignment" WHERE id = $1 AND "userID" = $2`,
    [assignmentID, userID]
  );
  if (rows.length === 0) throw new ProgressError('Assignment not found.', 404);
}

/** Set (or clear, with null) how many minutes the student expects this to take. */
async function setEstimate(userID, assignmentID, minutes, source = 'student') {
  if (minutes !== null) {
    if (typeof minutes !== 'number' || !Number.isInteger(minutes) ||
        minutes < 1 || minutes > MAX_ESTIMATE_MINUTES) {
      throw new ProgressError(
        `Estimate must be a whole number of minutes between 1 and ${MAX_ESTIMATE_MINUTES}.`, 400
      );
    }
  }

  await assertOwned(pool, userID, assignmentID);

  const { rows: [row] } = await pool.query(
    `INSERT INTO "AssignmentDetail" ("assignmentID", "estimatedMinutes", "estimateSource")
     VALUES ($1, $2, $3)
     ON CONFLICT ("assignmentID") DO UPDATE SET
       "estimatedMinutes" = EXCLUDED."estimatedMinutes",
       "estimateSource"   = EXCLUDED."estimateSource"
     RETURNING "estimatedMinutes", "estimateSource"`,
    [assignmentID, minutes, minutes === null ? null : source]
  );

  return {
    assignmentID,
    estimatedMinutes: row.estimatedMinutes,
    estimateSource:   row.estimateSource,
  };
}

/** Mark an assignment done (true) or not done (false). Re-marking keeps the first time. */
async function setCompleted(userID, assignmentID, completed) {
  if (typeof completed !== 'boolean') {
    throw new ProgressError('completed must be true or false.', 400);
  }

  await assertOwned(pool, userID, assignmentID);

  const { rows: [row] } = await pool.query(
    `UPDATE "Assignment"
        SET "completedAt" = CASE WHEN $3 THEN COALESCE("completedAt", NOW()) ELSE NULL END
      WHERE id = $1 AND "userID" = $2
      RETURNING "dueAt", "submittedAt", "submissionState", late, missing, excused, "completedAt"`,
    [assignmentID, userID, completed]
  );

  return {
    assignmentID,
    completedAt:      row.completedAt,
    completionStatus: completionStatus(row),
  };
}

module.exports = {
  ProgressError,
  MAX_ESTIMATE_MINUTES,
  completionStatus,
  setEstimate,
  setCompleted,
};
