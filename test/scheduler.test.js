// test/scheduler.test.js
// Covers services/scheduler.js: UC8's open-block finder (conflict handling),
// the greedy placement algorithm, and autoScheduleForUser end to end.
//
//   npm test
//
// findOpenBlocks and placeAssignments are pure and run with no database.
// autoScheduleForUser touches the real database with an @example.invalid
// user/course/assignments and deletes them afterward, same pattern as
// test/aiCache.test.js and test/assignmentProgress.test.js.

require('dotenv').config({ quiet: true });

const test   = require('node:test');
const assert = require('node:assert/strict');

const { findOpenBlocks, placeAssignments, autoScheduleForUser } = require('../services/scheduler');
const pool = require('../db');

// ── findOpenBlocks: pure ────────────────────────────────────────────────────

test('a window with no busy events is one open block per day, clipped to daily hours', () => {
  const windowStart = new Date('2026-10-05T00:00:00');
  const windowEnd    = new Date('2026-10-06T00:00:00');

  const blocks = findOpenBlocks([], windowStart, windowEnd, { dailyStartHour: 9, dailyEndHour: 21 });

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].start.getHours(), 9);
  assert.equal(blocks[0].end.getHours(), 21);
});

test('a busy event in the middle of the day splits it into two open blocks', () => {
  const windowStart = new Date('2026-10-05T00:00:00');
  const windowEnd    = new Date('2026-10-06T00:00:00');
  const busy = [{ start: new Date('2026-10-05T12:00:00'), end: new Date('2026-10-05T13:00:00') }];

  const blocks = findOpenBlocks(busy, windowStart, windowEnd, { dailyStartHour: 9, dailyEndHour: 21 });

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].end.getTime(), busy[0].start.getTime());
  assert.equal(blocks[1].start.getTime(), busy[0].end.getTime());
});

test('nothing is ever scheduled outside daily working hours, across multiple days', () => {
  const windowStart = new Date('2026-10-05T00:00:00');
  const windowEnd    = new Date('2026-10-08T00:00:00'); // 3 days

  const blocks = findOpenBlocks([], windowStart, windowEnd, { dailyStartHour: 9, dailyEndHour: 21 });

  assert.equal(blocks.length, 3, 'one block per day');
  for (const block of blocks) {
    assert.ok(block.start.getHours() >= 9);
    assert.ok(block.end.getHours() <= 21);
  }
});

test('two overlapping busy events are merged, not left with a bogus sliver between them', () => {
  const windowStart = new Date('2026-10-05T00:00:00');
  const windowEnd    = new Date('2026-10-06T00:00:00');
  const busy = [
    { start: new Date('2026-10-05T12:00:00'), end: new Date('2026-10-05T14:00:00') },
    { start: new Date('2026-10-05T13:00:00'), end: new Date('2026-10-05T15:00:00') }, // overlaps the first
  ];

  const blocks = findOpenBlocks(busy, windowStart, windowEnd, { dailyStartHour: 9, dailyEndHour: 21 });

  // Should be exactly two open blocks: 9-12 and 15-21. If the overlap wasn't
  // merged, a (wrong) 14-13 sliver would show up as an extra block.
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].end.getHours(), 12);
  assert.equal(blocks[1].start.getHours(), 15);
});

// ── placeAssignments: pure ───────────────────────────────────────────────────

test('an assignment that fits is placed at the start of the open block', () => {
  const blocks = [{ start: new Date('2026-10-05T09:00:00'), end: new Date('2026-10-05T21:00:00') }];
  const assignments = [{ id: 'a1', estimatedMinutes: 60, dueAt: new Date('2026-10-10T00:00:00') }];

  const { scheduled, unscheduled } = placeAssignments(assignments, blocks);

  assert.equal(unscheduled.length, 0);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].start.getTime(), blocks[0].start.getTime());
  assert.equal(scheduled[0].end.getTime() - scheduled[0].start.getTime(), 60 * 60 * 1000);
});

test('an assignment longer than any open block is reported unscheduled, not dropped', () => {
  const blocks = [{ start: new Date('2026-10-05T09:00:00'), end: new Date('2026-10-05T10:00:00') }]; // 1 hour
  const assignments = [{ id: 'a1', estimatedMinutes: 120, dueAt: new Date('2026-10-10T00:00:00') }]; // needs 2 hours

  const { scheduled, unscheduled } = placeAssignments(assignments, blocks);

  assert.equal(scheduled.length, 0);
  assert.equal(unscheduled.length, 1);
  assert.equal(unscheduled[0].assignmentId, 'a1');
});

test('the due date cuts off how much of a block an assignment may use', () => {
  // A long open block, but the assignment is due partway through it.
  const blocks = [{ start: new Date('2026-10-05T09:00:00'), end: new Date('2026-10-05T21:00:00') }];
  const assignments = [{ id: 'a1', estimatedMinutes: 600, dueAt: new Date('2026-10-05T10:00:00') }]; // due in 1hr, needs 10hrs

  const { scheduled, unscheduled } = placeAssignments(assignments, blocks);

  assert.equal(scheduled.length, 0);
  assert.equal(unscheduled.length, 1);
  assert.match(unscheduled[0].reason, /due date/);
});

test('two assignments competing for one block: the one due sooner gets placed first', () => {
  const blocks = [{ start: new Date('2026-10-05T09:00:00'), end: new Date('2026-10-05T11:00:00') }]; // 2 hours
  const assignments = [
    { id: 'due-later',  estimatedMinutes: 60, dueAt: new Date('2026-10-20T00:00:00') },
    { id: 'due-sooner', estimatedMinutes: 60, dueAt: new Date('2026-10-06T00:00:00') },
  ];

  const { scheduled, unscheduled } = placeAssignments(assignments, blocks);

  assert.equal(unscheduled.length, 0);
  assert.equal(scheduled.length, 2);
  const first = scheduled.find(s => s.assignmentId === 'due-sooner');
  const second = scheduled.find(s => s.assignmentId === 'due-later');
  assert.equal(first.start.getTime(), blocks[0].start.getTime(), 'the sooner-due assignment takes the earliest slot');
  assert.equal(second.start.getTime(), first.end.getTime(), 'the later one is placed right after it');
});

test('an assignment with no time estimate is reported unscheduled', () => {
  const blocks = [{ start: new Date('2026-10-05T09:00:00'), end: new Date('2026-10-05T21:00:00') }];
  const assignments = [{ id: 'a1', estimatedMinutes: null, dueAt: new Date('2026-10-10T00:00:00') }];

  const { scheduled, unscheduled } = placeAssignments(assignments, blocks);

  assert.equal(scheduled.length, 0);
  assert.equal(unscheduled[0].reason, 'no time estimate set');
});

// ── autoScheduleForUser: touches the database ───────────────────────────────

const EMAIL = `scheduler-test-${Date.now()}@example.invalid`;
let userId, courseId, busyAssignmentId, needsSchedulingId;

test('setup: throwaway user, course, a conflicting event, and an assignment to schedule', async () => {
  const user = await pool.query(
    `INSERT INTO "User" (email, "hashedPassword") VALUES ($1, 'not-a-real-hash') RETURNING id`,
    [EMAIL]
  );
  userId = user.rows[0].id;

  const course = await pool.query(`INSERT INTO "Course" (name) VALUES ('scheduler test course') RETURNING id`);
  courseId = course.rows[0].id;

  // An assignment that already has a calendar block -- this is the existing
  // "busy" time the scheduler must route around.
  const busyAssignment = await pool.query(
    `INSERT INTO "Assignment" ("userID", "courseID", title, "dueAt")
     VALUES ($1, $2, 'Already scheduled', NOW() + INTERVAL '5 days') RETURNING id`,
    [userId, courseId]
  );
  busyAssignmentId = busyAssignment.rows[0].id;

  const windowStart = new Date();
  windowStart.setHours(9, 0, 0, 0);
  const busyEnd = new Date(windowStart.getTime() + 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO "CalendarEvent" ("assignmentID", title, calendar, "eventStart", "eventEnd")
     VALUES ($1, 'Existing event', 'primary', $2, $3)`,
    [busyAssignmentId, windowStart, busyEnd]
  );

  // A separate assignment that still needs to be scheduled.
  const needsScheduling = await pool.query(
    `INSERT INTO "Assignment" ("userID", "courseID", title, "dueAt")
     VALUES ($1, $2, 'Essay needing a study block', NOW() + INTERVAL '5 days') RETURNING id`,
    [userId, courseId]
  );
  needsSchedulingId = needsScheduling.rows[0].id;

  await pool.query(
    `INSERT INTO "AssignmentDetail" ("assignmentID", "estimatedMinutes", "estimateSource")
     VALUES ($1, 60, 'student')`,
    [needsSchedulingId]
  );
});

test('autoScheduleForUser places the assignment without overlapping the existing event', async () => {
  const windowStart = new Date();
  const windowEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const { scheduled, unscheduled } = await autoScheduleForUser(userId, { windowStart, windowEnd });

  assert.equal(unscheduled.length, 0);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].assignmentID, needsSchedulingId);
  assert.equal(scheduled[0].calendar, 'smart-schedule');

  // Confirm it does not overlap the pre-existing event for this user.
  const { rows: existing } = await pool.query(
    `SELECT "eventStart", "eventEnd" FROM "CalendarEvent" WHERE "assignmentID" = $1`,
    [busyAssignmentId]
  );
  const placedStart = new Date(scheduled[0].eventStart);
  const placedEnd   = new Date(scheduled[0].eventEnd);
  const busyStart   = new Date(existing[0].eventStart);
  const busyEnd     = new Date(existing[0].eventEnd);
  const overlaps = placedStart < busyEnd && placedEnd > busyStart;
  assert.equal(overlaps, false, 'the new study block must not overlap the existing event');
});

test('running it again does not duplicate the block for the same assignment', async () => {
  const windowStart = new Date();
  const windowEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const { scheduled } = await autoScheduleForUser(userId, { windowStart, windowEnd });

  assert.equal(scheduled.length, 0, 'the assignment already has a CalendarEvent, so it is skipped');

  const { rows } = await pool.query(
    `SELECT id FROM "CalendarEvent" WHERE "assignmentID" = $1`,
    [needsSchedulingId]
  );
  assert.equal(rows.length, 1, 'still exactly one block for that assignment');
});

test('cleanup: remove the throwaway user (cascades to Assignment/AssignmentDetail/CalendarEvent)', async () => {
  await pool.query(`DELETE FROM "User" WHERE id = $1`, [userId]);
  await pool.query(`DELETE FROM "Course" WHERE id = $1`, [courseId]);
  await pool.end();
});
