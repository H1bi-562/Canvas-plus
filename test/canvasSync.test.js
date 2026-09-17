// test/canvasSync.test.js
// Covers connecting with a personal access token and syncing a student's Canvas
// courses and assignments into the database. Runs against test/mockCanvas.js.
//
//   npm test
//
// Touches the real database (there is no separate test DB on this project).
// Creates two @example.invalid users plus Course rows keyed to the mock's
// ephemeral base URL, and deletes all of them afterwards.

require('dotenv').config({ quiet: true });

const test   = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { createMockCanvas, VALID_PAT } = require('./mockCanvas');

process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const canvas     = require('../services/canvasAuth');
const canvasSync = require('../services/canvasSync');
const progress   = require('../services/assignmentProgress');
const pool       = require('../db');

/**
 * Point the service at the mock in PAT mode. The OAuth client vars are removed
 * on purpose: a PAT deployment has no developer key, and nothing on this path
 * may require one.
 */
async function withMockCanvasPAT(opts) {
  const mock = await createMockCanvas(opts).start();
  process.env.CANVAS_BASE_URL = mock.baseURL;
  delete process.env.CANVAS_CLIENT_ID;
  delete process.env.CANVAS_CLIENT_SECRET;
  delete process.env.CANVAS_REDIRECT_URI;
  return mock;
}

async function createUser(label) {
  const { rows } = await pool.query(
    `INSERT INTO "User" (email, "hashedPassword") VALUES ($1, 'x') RETURNING id`,
    [`canvassync+${label}-${Date.now()}@example.invalid`]
  );
  return rows[0].id;
}

// ── No database needed ────────────────────────────────────────────────────

test('rejects a token Canvas does not accept, without storing anything', async (t) => {
  const mock = await withMockCanvasPAT();
  t.after(() => mock.close());

  await assert.rejects(
    () => canvas.connectWithToken(crypto.randomUUID(), 'not-a-real-token'),
    (err) => err instanceof canvas.CanvasAuthError && err.status === 400 &&
             /rejected/i.test(err.message)
  );
});

test('rejects an empty or malformed token before calling Canvas', async (t) => {
  const mock = await withMockCanvasPAT();
  t.after(() => mock.close());

  for (const bad of ['', '   ', null, 'has spaces inside', 'x'.repeat(600)]) {
    await assert.rejects(
      () => canvas.connectWithToken(crypto.randomUUID(), bad),
      (err) => err.status === 400
    );
  }
  assert.equal(mock.state.apiRequests.length, 0, 'Canvas was never called');
});

test('follows Canvas pagination to the last page', async (t) => {
  const mock = await withMockCanvasPAT({ pageCap: 2 });
  t.after(() => mock.close());

  const items = await canvasSync.canvasGetAll(
    mock.baseURL, VALID_PAT, '/api/v1/courses/101/assignments'
  );
  assert.deepEqual(items.map((a) => a.id), [5001, 5002, 5003]);
  const pages = mock.state.apiRequests.filter((r) => r.path === '/courses/101/assignments');
  assert.equal(pages.length, 2, 'two pages were requested');
});

test('refuses to follow a pagination link to a different host', async () => {
  // A next link pointing elsewhere would hand the student's token to that host.
  assert.throws(
    () => canvasSync.assertSameOrigin('https://csulb.instructure.com', 'https://evil.example/api/v1/courses?page=2'),
    (err) => err.status === 502
  );
  assert.doesNotThrow(
    () => canvasSync.assertSameOrigin('https://csulb.instructure.com', 'https://csulb.instructure.com/api/v1/courses?page=2')
  );
});

// ── Connect + sync lifecycle (touches the database) ───────────────────────

test('PAT connection and assignment sync', async (t) => {
  const mock  = await withMockCanvasPAT();
  const alice = await createUser('alice');
  const bob   = await createUser('bob');

  t.after(async () => {
    await pool.query(`DELETE FROM "User" WHERE id = ANY($1)`, [[alice, bob]]);
    await pool.query(`DELETE FROM "Course" WHERE "canvasBaseURL" = $1`, [mock.baseURL]);
    await mock.close();
    await pool.end();
  });

  const assignmentsFor = async (userID) => (await pool.query(
    `SELECT a.*, c."canvasCourseID", c."courseCode", c.name AS "courseName",
            c.department, c.semester, c.grade
       FROM "Assignment" a JOIN "Course" c ON c.id = a."courseID"
      WHERE a."userID" = $1
      ORDER BY a."canvasAssignmentID"`,
    [userID]
  )).rows;

  await t.test('sync fails clearly before Canvas is connected', async () => {
    await assert.rejects(
      () => canvasSync.syncAssignments(alice),
      (err) => err.status === 404 && /not connected/i.test(err.message)
    );
  });

  await t.test('connects with a PAT, stored encrypted, no developer key needed', async () => {
    const status = await canvas.connectWithToken(alice, `  ${VALID_PAT}\n`);
    assert.equal(status.connected, true);
    assert.equal(status.authType, 'pat');
    assert.equal(status.canvasName, 'Test Student');
    assert.ok(!JSON.stringify(status).includes(VALID_PAT), 'status leaks no token');

    const row = await canvas.loadGrant(alice);
    assert.equal(row.authType, 'pat');
    assert.equal(row.refreshToken, null);
    assert.equal(row.expiresAt, null);
    assert.ok(!row.accessToken.includes(VALID_PAT), 'token not stored in plaintext');

    assert.equal(await canvas.getValidAccessToken(alice), VALID_PAT);
    assert.equal(mock.state.refreshCalls, 0, 'a PAT is never refreshed');
  });

  await t.test('imports active courses and their assignments', async () => {
    const result = await canvasSync.syncAssignments(alice);

    assert.equal(result.courses, 2, 'concluded and date-restricted courses skipped');
    assert.equal(result.assignments, 4);
    assert.equal(result.created, 4);
    assert.equal(result.updated, 0);

    const rows = await assignmentsFor(alice);
    assert.deepEqual(rows.map((r) => r.canvasAssignmentID), ['5001', '5002', '5003', '6001']);

    const review = rows.find((r) => r.canvasAssignmentID === '5001');
    assert.equal(review.title, 'Weekly Review 9/19');
    assert.equal(review.points, 10);
    assert.equal(new Date(review.dueAt).toISOString(), '2026-09-20T06:59:00.000Z');
    assert.equal(review.canvasCourseID, '101');
    assert.equal(review.courseCode, 'CECS 491B-02');
    assert.equal(review.department, 'CECS');
    assert.equal(review.semester, 'Fall 2026');
    assert.match(review.htmlURL, /\/courses\/101\/assignments\/5001$/);
    assert.ok(review.syncedAt, 'syncedAt stamped');

    const spec = rows.find((r) => r.canvasAssignmentID === '5002');
    assert.equal(spec.points, 3, 'fractional points rounded for the INTEGER column');
    assert.equal(new Date(spec.availableUntil).toISOString(), '2026-09-28T06:59:00.000Z');

    const retro = rows.find((r) => r.canvasAssignmentID === '5003');
    assert.equal(retro.dueAt, null, 'undated assignments are kept');
  });

  await t.test("stores Canvas's view of each submission", async () => {
    const rows = await assignmentsFor(alice);
    const byID = Object.fromEntries(rows.map((r) => [r.canvasAssignmentID, r]));

    assert.equal(byID['5001'].submissionState, 'unsubmitted');
    assert.equal(byID['5001'].submittedAt, null);

    assert.equal(byID['5002'].submissionState, 'submitted');
    assert.equal(new Date(byID['5002'].submittedAt).toISOString(), '2026-09-26T20:00:00.000Z');
    assert.equal(byID['5002'].late, false);

    assert.equal(byID['6001'].late, true);
    assert.equal(byID['5003'].excused, true);

    assert.equal(progress.completionStatus(byID['5002']), 'submitted');
    assert.equal(progress.completionStatus(byID['6001']), 'late');
    assert.equal(progress.completionStatus(byID['5003']), 'excused');
  });

  await t.test('only reads from Canvas', async () => {
    const writes = mock.state.apiRequests.filter((r) => r.method !== 'GET');
    assert.deepEqual(writes, [], 'no POST/PUT/DELETE sent to Canvas');
  });

  await t.test("re-sync refreshes submissions but never clears the student's Mark done", async () => {
    const before = (await assignmentsFor(alice)).find((r) => r.canvasAssignmentID === '5001');
    await progress.setCompleted(alice, before.id, true);

    mock.state.updateAssignment(101, 5001, {
      submission: { workflow_state: 'submitted', submitted_at: '2026-09-19T18:00:00Z', late: false, missing: false, excused: false },
    });
    await canvasSync.syncAssignments(alice);

    const after = (await assignmentsFor(alice)).find((r) => r.canvasAssignmentID === '5001');
    assert.ok(after.completedAt, 'manual completion kept');
    assert.equal(after.submissionState, 'submitted', 'Canvas state refreshed');
    assert.equal(new Date(after.submittedAt).toISOString(), '2026-09-19T18:00:00.000Z');
  });

  await t.test('re-sync updates in place instead of duplicating', async () => {
    mock.state.updateAssignment(101, 5001, {
      name: 'Weekly Review 9/19 (extended)',
      due_at: '2026-09-21T06:59:00Z',
    });

    const result = await canvasSync.syncAssignments(alice);
    assert.equal(result.created, 0);
    assert.equal(result.updated, 4);

    const rows = await assignmentsFor(alice);
    assert.equal(rows.length, 4, 'no duplicates');
    const review = rows.find((r) => r.canvasAssignmentID === '5001');
    assert.equal(review.title, 'Weekly Review 9/19 (extended)');
    assert.equal(new Date(review.dueAt).toISOString(), '2026-09-21T06:59:00.000Z');
  });

  await t.test("two students in the same class never share or overwrite rows", async () => {
    await canvas.connectWithToken(bob, VALID_PAT);
    const result = await canvasSync.syncAssignments(bob);
    assert.equal(result.created, 4, 'bob gets his own rows');

    const aliceRows = await assignmentsFor(alice);
    const bobRows   = await assignmentsFor(bob);
    assert.equal(aliceRows.length, 4);
    assert.equal(bobRows.length, 4);

    const aliceIDs = new Set(aliceRows.map((r) => r.id));
    assert.ok(bobRows.every((r) => !aliceIDs.has(r.id)), 'no assignment row is shared');
    assert.ok(bobRows.every((r) => r.userID === bob));

    // Course rows are shared metadata; sync must never write a grade into them.
    assert.ok([...aliceRows, ...bobRows].every((r) => r.grade === null), 'grade untouched');
    const { rows: courseRows } = await pool.query(
      `SELECT count(*)::int AS n FROM "Course" WHERE "canvasBaseURL" = $1`, [mock.baseURL]
    );
    assert.equal(courseRows[0].n, 2, 'one Course row per Canvas course, not per student');
  });

  await t.test('a revoked PAT surfaces as "reconnect", not as signed out', async () => {
    mock.state.revokePersonalToken(VALID_PAT);
    await assert.rejects(
      () => canvasSync.syncAssignments(alice),
      // 409, not 401: the UI treats 401 as "your Canvas-Plus session ended".
      (err) => err.status === 409 && /reconnect/i.test(err.message)
    );
  });

  await t.test('disconnecting a PAT removes it locally and leaves Canvas alone', async () => {
    const result = await canvas.disconnect(alice);
    assert.equal(result.removed, true);
    assert.equal(result.revokedAtCanvas, false, 'the student manages their own PAT in Canvas');
    assert.equal(mock.state.revoked.length, 0);
    assert.equal(await canvas.loadGrant(alice), null);
  });
});
