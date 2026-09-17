// test/analytics.test.js
// Covers GET /api/analytics/summary's computation (services/analytics.js) against
// a fixture whose every number was worked out by hand. Times are Pacific; one
// session starts at 11:30 PM so a UTC-bucketing bug would move it to the next day.
//
//   npm test
//
// Touches the real database: two @example.invalid users and two test Course rows,
// all deleted afterwards.

require('dotenv').config({ quiet: true });

const test   = require('node:test');
const assert = require('node:assert/strict');

const analytics = require('../services/analytics');
const pool      = require('../db');

const TZ  = 'America/Los_Angeles';
const pt  = (local) => new Date(`${local}-07:00`); // September 2026 is PDT (UTC-7)
const NOW = pt('2026-09-14T13:00:00');             // a Monday

test('local date and week helpers respect the time zone', () => {
  // 11:30 PM Pacific on 9/4 is already 9/5 in UTC.
  assert.equal(analytics.localDateKey(pt('2026-09-04T23:30:00'), TZ), '2026-09-04');
  assert.equal(analytics.localDateKey(pt('2026-09-04T23:30:00'), 'UTC'), '2026-09-05');
  // Weeks start on Monday.
  assert.equal(analytics.weekStartKey('2026-09-01'), '2026-08-31'); // Tue -> Mon
  assert.equal(analytics.weekStartKey('2026-09-13'), '2026-09-07'); // Sun -> previous Mon
  assert.equal(analytics.weekStartKey('2026-09-14'), '2026-09-14'); // Mon -> itself
  // Across the November DST change the key still moves one calendar day at a time.
  assert.equal(analytics.addDays('2026-11-01', 1), '2026-11-02');
});

test('analytics summary', async (t) => {
  const makeUser = async (label) => (await pool.query(
    `INSERT INTO "User" (email, "hashedPassword") VALUES ($1, 'x') RETURNING id`,
    [`analytics+${label}-${Date.now()}@example.invalid`]
  )).rows[0].id;
  const alice = await makeUser('alice');
  const bob   = await makeUser('bob');

  const tag = `analytics-${Date.now()}`;
  const makeCourse = async (code, name) => (await pool.query(
    `INSERT INTO "Course" (name, "courseCode", "canvasBaseURL", "canvasCourseID")
     VALUES ($1, $2, 'test://analytics', $3) RETURNING id`,
    [name, code, `${tag}-${code}`]
  )).rows[0].id;
  const courseA = await makeCourse('TEST 101-01', 'Course A');
  const courseB = await makeCourse('TEST 202-01', 'Course B');

  t.after(async () => {
    await pool.query(`DELETE FROM "User" WHERE id = ANY($1)`, [[alice, bob]]);
    await pool.query(`DELETE FROM "Course" WHERE id = ANY($1)`, [[courseA, courseB]]);
    await pool.end();
  });

  const assignment = async (userID, courseID, title, fields = {}) => {
    const { rows: [row] } = await pool.query(
      `INSERT INTO "Assignment"
         ("userID", "courseID", title, points, "dueAt", "submittedAt", "submissionState",
          late, missing, "completedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [userID, courseID, title, fields.points ?? null, fields.dueAt ?? null,
       fields.submittedAt ?? null, fields.submissionState ?? null,
       fields.late ?? null, fields.missing ?? null, fields.completedAt ?? null]
    );
    if (fields.estimate != null) {
      await pool.query(
        `INSERT INTO "AssignmentDetail" ("assignmentID", "estimatedMinutes", "estimateSource")
         VALUES ($1, $2, 'student')`,
        [row.id, fields.estimate]
      );
    }
    return row.id;
  };

  const session = (userID, assignmentID, startLocal, wallMin, activeMin, status = 'completed') => {
    const startedAt = pt(startLocal);
    const endedAt = status === 'completed' ? new Date(startedAt.getTime() + wallMin * 60000) : null;
    return pool.query(
      `INSERT INTO "StudySession" ("userID", "assignmentID", status, "startedAt", "endedAt", "durationSeconds")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userID, assignmentID, status, startedAt, endedAt, activeMin * 60]
    );
  };

  // Alice's coursework.
  const A1 = await assignment(alice, courseA, 'Essay', {
    points: 10, dueAt: pt('2026-09-05T23:59:00'), estimate: 120,
    submittedAt: pt('2026-09-05T20:00:00'), submissionState: 'submitted', late: false,
  });                                                                        // submitted on time
  const A2 = await assignment(alice, courseA, 'Lab', {
    points: 20, dueAt: pt('2026-09-08T23:59:00'), estimate: 60,
    completedAt: pt('2026-09-09T10:00:00'),
  });                                                                        // marked done late
  await assignment(alice, courseB, 'Quiz', {
    points: 5, dueAt: pt('2026-09-10T23:59:00'), missing: true, submissionState: 'unsubmitted',
  });                                                                        // missing
  const A4 = await assignment(alice, courseB, 'Project', {
    points: 100, dueAt: pt('2026-09-16T23:59:00'), estimate: 300,
  });                                                                        // due in ~59h, 30m logged: at risk
  await assignment(alice, courseA, 'Reading', { dueAt: pt('2026-09-20T23:59:00'), estimate: 30 });
  await assignment(alice, courseB, 'Old', {
    dueAt: pt('2026-08-20T23:59:00'), submittedAt: pt('2026-08-19T12:00:00'), submissionState: 'submitted', late: false,
  });                                                                        // before the range
  const A8 = await assignment(alice, courseA, 'Worksheet', { dueAt: pt('2026-09-15T23:59:00') });
                                                                             // due in ~35h, nothing logged: at risk

  // Alice's sessions: start, wall minutes, active minutes.
  await session(alice, A1,   '2026-08-25T10:00:00', 30, 30);  // before range: all-time actual + streak only
  await session(alice, A1,   '2026-09-03T19:00:00', 70, 60);
  await session(alice, A1,   '2026-09-04T23:30:00', 90, 90);  // 9/5 in UTC
  await session(alice, A2,   '2026-09-09T08:00:00', 45, 30);
  await session(alice, A4,   '2026-09-12T14:00:00', 30, 30);
  await session(alice, null, '2026-09-13T10:00:00', 25, 20);  // general study
  await session(alice, A2,   '2026-09-14T09:00:00', 20, 15);
  await session(alice, A4,   '2026-09-14T12:00:00', 0, 5, 'active'); // still running: ignored

  // Bob studies the same week; none of it may leak into Alice's numbers.
  const B1 = await assignment(bob, courseA, 'Bob essay', { dueAt: pt('2026-09-06T23:59:00'), estimate: 10 });
  await session(bob, B1, '2026-09-10T10:00:00', 100, 100);

  const summary = await analytics.getSummary(alice, {
    from: '2026-09-01', to: '2026-09-14', tz: TZ, now: NOW,
  });

  await t.test('range echoes the request', () => {
    assert.deepEqual(summary.range, { from: '2026-09-01', to: '2026-09-14', tz: TZ, days: 14 });
  });

  await t.test('totals count only completed sessions started in range', () => {
    assert.deepEqual(summary.totals, {
      studyMinutes: 245,          // 60 + 90 + 30 + 30 + 20 + 15
      sessions: 6,
      avgSessionMinutes: 40.8,    // 245 / 6
      focusRatio: 0.875,          // 245 active / 280 wall
      activeDays: 6,
    });
  });

  await t.test('daily minutes bucket by local date, not UTC', () => {
    const day = Object.fromEntries(summary.daily.map((d) => [d.date, d.minutes]));
    assert.equal(summary.daily.length, 14, 'one entry per day, zeros included');
    assert.equal(day['2026-09-03'], 60);
    assert.equal(day['2026-09-04'], 90, 'the 11:30 PM session stays on 9/4');
    assert.equal(day['2026-09-05'], 0);
    assert.equal(day['2026-09-14'], 15);
  });

  await t.test('time per course, largest first, with general study separate', () => {
    assert.deepEqual(
      summary.timePerCourse.map(({ courseCode, courseName, minutes, sessions }) => ({ courseCode, courseName, minutes, sessions })),
      [
        { courseCode: 'TEST 101-01', courseName: 'Course A', minutes: 195, sessions: 4 },
        { courseCode: 'TEST 202-01', courseName: 'Course B', minutes: 30,  sessions: 1 },
        { courseCode: null,          courseName: 'General study', minutes: 20, sessions: 1 },
      ]
    );
  });

  await t.test('estimated vs. actual uses all-time study time per assignment', () => {
    assert.deepEqual(
      summary.estVsActual.map(({ title, estimatedMinutes, actualMinutes, variancePct, finished }) =>
        ({ title, estimatedMinutes, actualMinutes, variancePct, finished })),
      [
        { title: 'Essay',   estimatedMinutes: 120, actualMinutes: 180, variancePct: 50,  finished: true },
        { title: 'Lab',     estimatedMinutes: 60,  actualMinutes: 45,  variancePct: -25, finished: true },
        { title: 'Project', estimatedMinutes: 300, actualMinutes: 30,  variancePct: -90, finished: false },
      ]
    );
    // Finished work only: (180 + 45) / (120 + 60)
    assert.equal(summary.estimateRatio, 1.25);
  });

  await t.test('completion counts assignments due in range', () => {
    assert.deepEqual(summary.completion, {
      onTime: 1, late: 1, missing: 1, overdue: 0, pending: 0, excused: 0,
      total: 3, onTimeRate: 0.333,
    });
  });

  await t.test('workload per Monday-start week', () => {
    assert.deepEqual(summary.workload, [
      { weekStart: '2026-08-31', dueCount: 1, points: 10,  studyMinutes: 150, dueByCourse: { 'TEST 101-01': 1 } },
      { weekStart: '2026-09-07', dueCount: 2, points: 25,  studyMinutes: 80,  dueByCourse: { 'TEST 101-01': 1, 'TEST 202-01': 1 } },
      { weekStart: '2026-09-14', dueCount: 3, points: 100, studyMinutes: 15,  dueByCourse: { 'TEST 101-01': 2, 'TEST 202-01': 1 } },
    ]);
    assert.deepEqual(summary.courses.map((c) => c.courseCode), ['TEST 101-01', 'TEST 202-01']);
  });

  await t.test('streak counts consecutive local study days through today', () => {
    // Days: 8/25, 9/3, 9/4, 9/9, 9/12, 9/13, 9/14
    assert.deepEqual(summary.streak, { current: 3, longest: 3 });
  });

  await t.test('at risk: unfinished, due within 72 hours, little or no time logged', () => {
    assert.deepEqual(
      summary.atRisk.map(({ title, hoursLeft, loggedMinutes, estimatedMinutes }) => ({ title, hoursLeft, loggedMinutes, estimatedMinutes })),
      [
        { title: 'Worksheet', hoursLeft: 35, loggedMinutes: 0,  estimatedMinutes: null },
        { title: 'Project',   hoursLeft: 59, loggedMinutes: 30, estimatedMinutes: 300 },
      ]
    );
  });

  await t.test("another student's data never appears", async () => {
    const bobSummary = await analytics.getSummary(bob, { from: '2026-09-01', to: '2026-09-14', tz: TZ, now: NOW });
    assert.equal(bobSummary.totals.studyMinutes, 100);
    assert.equal(summary.totals.studyMinutes, 245, "alice's totals exclude bob's 100 minutes");
    assert.ok(!summary.estVsActual.some((r) => r.title === 'Bob essay'));
  });

  await t.test('an empty range returns zeros, not errors', async () => {
    const empty = await analytics.getSummary(alice, { from: '2026-01-01', to: '2026-01-07', tz: TZ, now: NOW });
    assert.equal(empty.totals.studyMinutes, 0);
    assert.equal(empty.totals.focusRatio, null);
    assert.equal(empty.totals.avgSessionMinutes, 0);
    assert.equal(empty.completion.onTimeRate, null);
    assert.deepEqual(empty.timePerCourse, []);
    assert.equal(empty.daily.length, 7);
  });

  await t.test('defaults to the last 30 days in the given time zone', async () => {
    const d = await analytics.getSummary(alice, { tz: TZ, now: NOW });
    assert.deepEqual(d.range, { from: '2026-08-16', to: '2026-09-14', tz: TZ, days: 30 });
  });

  await t.test('rejects bad input with 400', async () => {
    const bad = [
      { from: '2026-09-01', to: '2026-09-14', tz: 'Mars/Olympus' },
      { from: '2026-13-01', to: '2026-09-14', tz: TZ },
      { from: '2026-09-31', to: '2026-10-01', tz: TZ },
      { from: '2026-09-14', to: '2026-09-01', tz: TZ },
      { from: '2025-01-01', to: '2026-09-14', tz: TZ },
    ];
    for (const params of bad) {
      await assert.rejects(
        () => analytics.getSummary(alice, { ...params, now: NOW }),
        (err) => err instanceof analytics.AnalyticsError && err.status === 400,
        JSON.stringify(params)
      );
    }
  });
});
