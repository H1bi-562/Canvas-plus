// test/demoData.test.js
// Covers the dev-only demo data used to preview the site before real Canvas
// access exists: seeding, idempotency, per-student isolation, and removal.
//
//   npm test
//
// Touches the real database. Creates @example.invalid users and deletes them
// afterwards. Demo Course rows are shared with anyone else who seeded demo data,
// so cleanup only removes the ones nothing references any more.

require('dotenv').config({ quiet: true });

const test   = require('node:test');
const assert = require('node:assert/strict');

const demo = require('../services/demoData');
const pool = require('../db');

async function createUser(label) {
  const { rows } = await pool.query(
    `INSERT INTO "User" (email, "hashedPassword") VALUES ($1, 'x') RETURNING id`,
    [`demodata+${label}-${Date.now()}@example.invalid`]
  );
  return rows[0].id;
}

const demoAssignments = async (userID) => (await pool.query(
  `SELECT a.*, c."courseCode", c."canvasBaseURL"
     FROM "Assignment" a JOIN "Course" c ON c.id = a."courseID"
    WHERE a."userID" = $1 AND c."canvasBaseURL" = $2`,
  [userID, demo.DEMO_BASE_URL]
)).rows;

const sessionsFor = async (userID) => (await pool.query(
  `SELECT * FROM "StudySession" WHERE "userID" = $1`, [userID]
)).rows;

test('demo data lifecycle', async (t) => {
  const alice = await createUser('alice');
  const bob   = await createUser('bob');
  let realCourseID = null;

  t.after(async () => {
    await pool.query(`DELETE FROM "User" WHERE id = ANY($1)`, [[alice, bob]]);
    if (realCourseID) await pool.query(`DELETE FROM "Course" WHERE id = $1`, [realCourseID]);
    // Only unreferenced demo courses: a teammate may have seeded their own account.
    await pool.query(
      `DELETE FROM "Course" c WHERE c."canvasBaseURL" = $1
         AND NOT EXISTS (SELECT 1 FROM "Assignment" a WHERE a."courseID" = c.id)`,
      [demo.DEMO_BASE_URL]
    );
    await pool.end();
  });

  await t.test('seeds courses, assignments, and past study sessions', async () => {
    const result = await demo.seedDemoData(alice);

    assert.equal(result.courses, demo.DEMO_COURSES.length);
    assert.equal(result.assignments, demo.DEMO_ASSIGNMENTS.length);
    assert.equal(result.created, demo.DEMO_ASSIGNMENTS.length);
    assert.ok(result.sessions > 0, 'past sessions were created');

    const rows = await demoAssignments(alice);
    assert.equal(rows.length, demo.DEMO_ASSIGNMENTS.length);
    assert.ok(rows.every((r) => r.canvasAssignmentID.startsWith('demo-')));

    const now = Date.now();
    assert.ok(rows.some((r) => new Date(r.dueAt).getTime() > now), 'some are upcoming');
    assert.ok(rows.some((r) => new Date(r.dueAt).getTime() < now), 'some are past due');
  });

  await t.test('seeds estimates and a realistic mix of completion states', async () => {
    const progress = require('../services/assignmentProgress');
    const { rows } = await pool.query(
      `SELECT a.*, ad."estimatedMinutes", ad."estimateSource"
         FROM "Assignment" a
         JOIN "Course" c ON c.id = a."courseID"
         LEFT JOIN "AssignmentDetail" ad ON ad."assignmentID" = a.id
        WHERE a."userID" = $1 AND c."canvasBaseURL" = $2`,
      [alice, demo.DEMO_BASE_URL]
    );

    const estimated = rows.filter((r) => r.estimatedMinutes != null);
    assert.ok(estimated.length >= rows.length / 2, 'most demo assignments have an estimate');
    assert.ok(rows.some((r) => r.estimatedMinutes == null), 'at least one has none, so the estimate prompt shows');
    assert.ok(estimated.every((r) => r.estimateSource === 'student'));

    const statuses = new Set(rows.map((r) => progress.completionStatus(r)));
    for (const expected of ['submitted', 'late', 'missing', 'done', 'pending']) {
      assert.ok(statuses.has(expected), `demo data includes a "${expected}" assignment`);
    }
  });

  await t.test('seeded sessions are completed, linked, and realistic', async () => {
    const sessions = await sessionsFor(alice);
    const assignmentIDs = new Set((await demoAssignments(alice)).map((r) => r.id));

    assert.ok(sessions.length > 0);
    for (const s of sessions) {
      assert.equal(s.status, 'completed');
      assert.ok(assignmentIDs.has(s.assignmentID), "linked to one of this student's demo assignments");
      assert.ok(new Date(s.endedAt) < new Date(), 'in the past');

      const wallSeconds = (new Date(s.endedAt) - new Date(s.startedAt)) / 1000;
      assert.ok(s.durationSeconds > 0);
      assert.ok(s.durationSeconds <= wallSeconds, 'active time never exceeds wall time');
    }
  });

  await t.test('seeding again changes nothing', async () => {
    const before = await sessionsFor(alice);
    const result = await demo.seedDemoData(alice);

    assert.equal(result.created, 0, 'no new assignments');
    assert.equal(result.sessions, 0, 'no duplicate sessions');
    assert.equal((await demoAssignments(alice)).length, demo.DEMO_ASSIGNMENTS.length);
    assert.equal((await sessionsFor(alice)).length, before.length);
  });

  await t.test('another student gets their own rows but shares course metadata', async () => {
    await demo.seedDemoData(bob);

    const aliceIDs = new Set((await demoAssignments(alice)).map((r) => r.id));
    const bobRows  = await demoAssignments(bob);
    assert.equal(bobRows.length, demo.DEMO_ASSIGNMENTS.length);
    assert.ok(bobRows.every((r) => !aliceIDs.has(r.id)), 'no shared assignment rows');

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM "Course" WHERE "canvasBaseURL" = $1`, [demo.DEMO_BASE_URL]
    );
    assert.equal(rows[0].n, demo.DEMO_COURSES.length, 'one demo Course row per course, not per student');
  });

  await t.test("removal deletes only this student's demo data", async () => {
    // A real (non-demo) assignment must survive removal.
    const { rows: [course] } = await pool.query(
      `INSERT INTO "Course" (name, "canvasBaseURL", "canvasCourseID")
       VALUES ('Real Course', 'test://not-demo', $1) RETURNING id`,
      [`real-${Date.now()}`]
    );
    realCourseID = course.id;
    await pool.query(
      `INSERT INTO "Assignment" ("userID", "courseID", title) VALUES ($1, $2, 'Real work')`,
      [alice, realCourseID]
    );

    const result = await demo.clearDemoData(alice);
    assert.equal(result.assignments, demo.DEMO_ASSIGNMENTS.length);
    assert.ok(result.sessions > 0);

    assert.equal((await demoAssignments(alice)).length, 0);
    assert.equal((await sessionsFor(alice)).length, 0, 'sessions on demo assignments removed');

    const { rows: real } = await pool.query(
      `SELECT title FROM "Assignment" WHERE "userID" = $1`, [alice]
    );
    assert.deepEqual(real.map((r) => r.title), ['Real work']);

    assert.equal((await demoAssignments(bob)).length, demo.DEMO_ASSIGNMENTS.length, 'bob untouched');
    assert.ok((await sessionsFor(bob)).length > 0, "bob's sessions untouched");
  });

  await t.test('shared demo courses disappear once nobody uses them', async () => {
    await demo.clearDemoData(bob);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM "Course" c
        WHERE c."canvasBaseURL" = $1
          AND NOT EXISTS (SELECT 1 FROM "Assignment" a WHERE a."courseID" = c.id)`,
      [demo.DEMO_BASE_URL]
    );
    assert.equal(rows[0].n, 0, 'no orphaned demo courses left behind');
  });
});
