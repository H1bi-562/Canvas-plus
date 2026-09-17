// test/assignmentProgress.test.js
// Covers the analytics inputs a student controls or Canvas reports: time
// estimates, "Mark done", and how the two combine into one completion status.
//
//   npm test
//
// The status rules run without a database. The estimate/completion block touches
// the real database with @example.invalid users and deletes them afterwards.

require('dotenv').config({ quiet: true });

const test   = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const progress = require('../services/assignmentProgress');
const pool     = require('../db');

// ── completionStatus: pure rules ──────────────────────────────────────────

const NOW  = new Date('2026-09-16T12:00:00Z').getTime();
const PAST = '2026-09-10T06:59:00Z';
const SOON = '2026-09-20T06:59:00Z';

const status = (fields) => progress.completionStatus({ dueAt: SOON, ...fields }, NOW);

test('an upcoming assignment with nothing done is pending', () => {
  assert.equal(status({}), 'pending');
});

test('a past-due assignment with nothing done is overdue', () => {
  assert.equal(status({ dueAt: PAST }), 'overdue');
});

test('Canvas submissions are submitted or late', () => {
  assert.equal(status({ submittedAt: '2026-09-15T00:00:00Z', submissionState: 'submitted', late: false }), 'submitted');
  assert.equal(status({ dueAt: PAST, submittedAt: '2026-09-11T00:00:00Z', submissionState: 'submitted', late: true }), 'late');
});

test('graded work with no online submission counts as submitted', () => {
  // Paper quizzes: Canvas has a grade but no submitted_at.
  assert.equal(status({ dueAt: PAST, submissionState: 'graded', missing: false }), 'submitted');
});

test('Canvas missing and excused flags are respected', () => {
  assert.equal(status({ dueAt: PAST, missing: true, submissionState: 'unsubmitted' }), 'missing');
  assert.equal(status({ dueAt: PAST, missing: true, excused: true }), 'excused');
});

test('Mark done wins over Canvas missing, and is late only if after the due date', () => {
  assert.equal(status({ dueAt: PAST, missing: true, completedAt: '2026-09-09T20:00:00Z' }), 'done');
  assert.equal(status({ dueAt: PAST, completedAt: '2026-09-12T20:00:00Z' }), 'late');
  assert.equal(status({ dueAt: null, completedAt: '2026-09-12T20:00:00Z' }), 'done');
});

test('no due date and nothing done is pending, never overdue', () => {
  assert.equal(status({ dueAt: null }), 'pending');
});

// ── Estimates and Mark done (touches the database) ────────────────────────

test('estimates and completion', async (t) => {
  const makeUser = async (label) => (await pool.query(
    `INSERT INTO "User" (email, "hashedPassword") VALUES ($1, 'x') RETURNING id`,
    [`progress+${label}-${Date.now()}@example.invalid`]
  )).rows[0].id;

  const alice = await makeUser('alice');
  const bob   = await makeUser('bob');
  const { rows: [course] } = await pool.query(
    `INSERT INTO "Course" (name, "canvasBaseURL", "canvasCourseID")
     VALUES ('Progress Test', 'test://progress', $1) RETURNING id`,
    [`progress-${Date.now()}`]
  );
  const { rows: [assignment] } = await pool.query(
    `INSERT INTO "Assignment" ("userID", "courseID", title, "dueAt")
     VALUES ($1, $2, 'Essay', NOW() - INTERVAL '1 day') RETURNING id`,
    [alice, course.id]
  );

  t.after(async () => {
    await pool.query(`DELETE FROM "User" WHERE id = ANY($1)`, [[alice, bob]]);
    await pool.query(`DELETE FROM "Course" WHERE id = $1`, [course.id]);
    await pool.end();
  });

  const detail = async () => (await pool.query(
    `SELECT "estimatedMinutes", "estimateSource" FROM "AssignmentDetail" WHERE "assignmentID" = $1`,
    [assignment.id]
  )).rows[0];

  await t.test('sets an estimate, creating the detail row if needed', async () => {
    const result = await progress.setEstimate(alice, assignment.id, 90);
    assert.deepEqual(result, { assignmentID: assignment.id, estimatedMinutes: 90, estimateSource: 'student' });
    assert.deepEqual(await detail(), { estimatedMinutes: 90, estimateSource: 'student' });
  });

  await t.test('updates and clears an estimate', async () => {
    await progress.setEstimate(alice, assignment.id, 45);
    assert.equal((await detail()).estimatedMinutes, 45);

    const cleared = await progress.setEstimate(alice, assignment.id, null);
    assert.equal(cleared.estimatedMinutes, null);
    assert.deepEqual(await detail(), { estimatedMinutes: null, estimateSource: null });
  });

  await t.test('rejects estimates that are not a sane number of minutes', async () => {
    for (const bad of [0, -5, 1.5, 6001, '60', NaN, undefined]) {
      await assert.rejects(
        () => progress.setEstimate(alice, assignment.id, bad),
        (err) => err instanceof progress.ProgressError && err.status === 400,
        `rejects ${String(bad)}`
      );
    }
  });

  await t.test('marks done and undone', async () => {
    const done = await progress.setCompleted(alice, assignment.id, true);
    assert.ok(done.completedAt, 'completedAt stamped');
    assert.equal(done.completionStatus, 'late', 'marked done after the due date');

    const again = await progress.setCompleted(alice, assignment.id, true);
    assert.equal(
      new Date(again.completedAt).getTime(), new Date(done.completedAt).getTime(),
      'marking done twice keeps the original completion time'
    );

    const undone = await progress.setCompleted(alice, assignment.id, false);
    assert.equal(undone.completedAt, null);
    assert.equal(undone.completionStatus, 'overdue');
  });

  await t.test('requires a real boolean for completion', async () => {
    for (const bad of ['true', 1, null, undefined]) {
      await assert.rejects(
        () => progress.setCompleted(alice, assignment.id, bad),
        (err) => err.status === 400
      );
    }
  });

  await t.test("a student cannot touch another student's assignment", async () => {
    await assert.rejects(() => progress.setEstimate(bob, assignment.id, 30), (err) => err.status === 404);
    await assert.rejects(() => progress.setCompleted(bob, assignment.id, true), (err) => err.status === 404);
    assert.equal((await detail()).estimatedMinutes, null, "alice's row unchanged");
  });

  await t.test('an unknown or malformed id is a 404, not a 500', async () => {
    await assert.rejects(() => progress.setEstimate(alice, crypto.randomUUID(), 30), (err) => err.status === 404);
    await assert.rejects(() => progress.setCompleted(alice, 'not-a-uuid', true), (err) => err.status === 404);
  });
});
