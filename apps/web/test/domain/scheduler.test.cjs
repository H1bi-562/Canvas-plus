// apps/web/test/domain/scheduler.test.cjs
// Covers src/queries/scheduler.js: UC8's open-block finder (conflict
// handling), the priority-aware greedy placement algorithm, and
// autoScheduleForUser end to end.
//
//   npm test
//
// findOpenBlocks and placeAssignments are pure and run with no database.
// autoScheduleForUser touches the real database with an @example.invalid
// user/course/assignments and deletes them afterward, same pattern as
// aiCache.test.cjs and summarize.test.cjs.

require("dotenv").config({ quiet: true });

const test   = require("node:test");
const assert = require("node:assert/strict");

const { findOpenBlocks, placeAssignments, autoScheduleForUser } = require("@canvasplus/database/queries/scheduler");
const pool = require("@canvasplus/database").pool;

// ── findOpenBlocks: pure ────────────────────────────────────────────────────

test("a window with no busy events is one open block per day, clipped to daily hours", () => {
  const windowStart = new Date("2026-10-05T00:00:00");
  const windowEnd    = new Date("2026-10-06T00:00:00");

  const blocks = findOpenBlocks([], windowStart, windowEnd, { dailyStartHour: 9, dailyEndHour: 21 });

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].start.getHours(), 9);
  assert.equal(blocks[0].end.getHours(), 21);
});

test("a busy event in the middle of the day splits it into two open blocks", () => {
  const windowStart = new Date("2026-10-05T00:00:00");
  const windowEnd    = new Date("2026-10-06T00:00:00");
  const busy = [{ start: new Date("2026-10-05T12:00:00"), end: new Date("2026-10-05T13:00:00") }];

  const blocks = findOpenBlocks(busy, windowStart, windowEnd, { dailyStartHour: 9, dailyEndHour: 21 });

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].end.getTime(), busy[0].start.getTime());
  assert.equal(blocks[1].start.getTime(), busy[0].end.getTime());
});

test("nothing is ever scheduled outside daily working hours, across multiple days", () => {
  const windowStart = new Date("2026-10-05T00:00:00");
  const windowEnd    = new Date("2026-10-08T00:00:00"); // 3 days

  const blocks = findOpenBlocks([], windowStart, windowEnd, { dailyStartHour: 9, dailyEndHour: 21 });

  assert.equal(blocks.length, 3, "one block per day");
  for (const block of blocks) {
    assert.ok(block.start.getHours() >= 9);
    assert.ok(block.end.getHours() <= 21);
  }
});

test("two overlapping busy events are merged, not left with a bogus sliver between them", () => {
  const windowStart = new Date("2026-10-05T00:00:00");
  const windowEnd    = new Date("2026-10-06T00:00:00");
  const busy = [
    { start: new Date("2026-10-05T12:00:00"), end: new Date("2026-10-05T14:00:00") },
    { start: new Date("2026-10-05T13:00:00"), end: new Date("2026-10-05T15:00:00") },
  ];

  const blocks = findOpenBlocks(busy, windowStart, windowEnd, { dailyStartHour: 9, dailyEndHour: 21 });

  assert.equal(blocks.length, 2, "one block before the merged busy span, one after");
  assert.equal(blocks[0].end.getHours(), 12);
  assert.equal(blocks[1].start.getHours(), 15);
});

// ── placeAssignments: pure ──────────────────────────────────────────────────

test("an assignment that fits is placed at the start of the open block", () => {
  const block = { start: new Date("2026-10-05T09:00:00"), end: new Date("2026-10-05T21:00:00") };
  const assignments = [{ id: "a1", estimatedMinutes: 60, dueAt: new Date("2026-10-06T00:00:00") }];

  const { scheduled, unscheduled } = placeAssignments(assignments, [block]);

  assert.equal(unscheduled.length, 0);
  assert.equal(scheduled[0].start.getTime(), block.start.getTime());
  assert.equal(scheduled[0].end.getTime(), block.start.getTime() + 60 * 60 * 1000);
});

test("an assignment longer than any open block is reported unscheduled, not dropped", () => {
  const block = { start: new Date("2026-10-05T09:00:00"), end: new Date("2026-10-05T10:00:00") };
  const assignments = [{ id: "a1", estimatedMinutes: 120, dueAt: new Date("2026-10-06T00:00:00") }];

  const { scheduled, unscheduled } = placeAssignments(assignments, [block]);

  assert.equal(scheduled.length, 0);
  assert.equal(unscheduled.length, 1);
  assert.equal(unscheduled[0].assignmentId, "a1");
});

test("the due date cuts off how much of a block an assignment may use", () => {
  const block = { start: new Date("2026-10-05T09:00:00"), end: new Date("2026-10-05T21:00:00") };
  // Due only 30 minutes into the block, but needs 60 -- cannot finish in time.
  const assignments = [{ id: "a1", estimatedMinutes: 60, dueAt: new Date("2026-10-05T09:30:00") }];

  const { scheduled, unscheduled } = placeAssignments(assignments, [block]);

  assert.equal(scheduled.length, 0);
  assert.equal(unscheduled[0].reason, "no open block of that length before the due date");
});

test("with no priority set on either, the assignment due sooner is placed first (old behavior preserved)", () => {
  const block = { start: new Date("2026-10-05T09:00:00"), end: new Date("2026-10-05T10:00:00") }; // fits exactly one
  const assignments = [
    { id: "due-later",  estimatedMinutes: 60, dueAt: new Date("2026-10-10T00:00:00") },
    { id: "due-sooner", estimatedMinutes: 60, dueAt: new Date("2026-10-06T00:00:00") },
  ];

  const { scheduled, unscheduled } = placeAssignments(assignments, [block]);

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].assignmentId, "due-sooner");
  assert.equal(unscheduled[0].assignmentId, "due-later");
});

test("UC15 priority order wins over due date: the higher-priority assignment is placed even though it is due later", () => {
  const block = { start: new Date("2026-10-05T09:00:00"), end: new Date("2026-10-05T10:00:00") }; // fits exactly one
  const assignments = [
    { id: "low-priority-due-soon",  estimatedMinutes: 60, dueAt: new Date("2026-10-06T00:00:00"), priority: 10 },
    { id: "high-priority-due-late", estimatedMinutes: 60, dueAt: new Date("2026-10-10T00:00:00"), priority: 90 },
  ];

  const { scheduled, unscheduled } = placeAssignments(assignments, [block]);

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].assignmentId, "high-priority-due-late", "priority 90 should beat priority 10, regardless of due date");
  assert.equal(unscheduled[0].assignmentId, "low-priority-due-soon");
});

test("an assignment with no priority score sorts after every scored one", () => {
  const block = { start: new Date("2026-10-05T09:00:00"), end: new Date("2026-10-05T10:00:00") }; // fits exactly one
  const assignments = [
    { id: "unscored", estimatedMinutes: 60, dueAt: new Date("2026-10-06T00:00:00") },           // priority omitted
    { id: "scored",   estimatedMinutes: 60, dueAt: new Date("2026-10-10T00:00:00"), priority: 1 }, // lowest possible score, but it IS scored
  ];

  const { scheduled } = placeAssignments(assignments, [block]);

  assert.equal(scheduled[0].assignmentId, "scored", "any real score outranks no score at all");
});

test("an assignment with no time estimate is reported unscheduled", () => {
  const block = { start: new Date("2026-10-05T09:00:00"), end: new Date("2026-10-05T21:00:00") };
  const assignments = [{ id: "a1", estimatedMinutes: null, dueAt: new Date("2026-10-06T00:00:00") }];

  const { unscheduled } = placeAssignments(assignments, [block]);

  assert.equal(unscheduled[0].reason, "no time estimate set");
});

// ── autoScheduleForUser: touches the database ───────────────────────────────

const EMAIL = `scheduler-test-${Date.now()}@example.invalid`;
let userId, courseId;

test("setup: throwaway user, course, a conflicting event, and an assignment to schedule", async () => {
  const user = await pool.query(
    "INSERT INTO \"User\" (email, name) VALUES ($1, 'x') RETURNING id",
    [EMAIL]
  );
  userId = user.rows[0].id;

  const course = await pool.query(
    `INSERT INTO "Course" (name, "canvasBaseURL", "canvasCourseID")
     VALUES ('scheduler test course', 'test://scheduler', $1) RETURNING id`,
    [`scheduler-${Date.now()}`]
  );
  courseId = course.rows[0].id;
});

test("autoScheduleForUser places the assignment without overlapping the existing event", async () => {
  const windowStart = new Date(); windowStart.setDate(windowStart.getDate() + 1); windowStart.setHours(9, 0, 0, 0);
  const windowEnd = new Date(windowStart); windowEnd.setHours(21, 0, 0, 0);
  const dueAt = windowEnd; // must fall within [windowStart, windowEnd] to be a scheduling candidate at all

  const assignment = await pool.query(
    `INSERT INTO "Assignment" ("userID", "courseID", title, points, "dueAt")
     VALUES ($1, $2, 'Essay', 20, $3) RETURNING id`,
    [userId, courseId, dueAt]
  );
  const assignmentId = assignment.rows[0].id;
  await pool.query(
    `INSERT INTO "AssignmentDetail" ("assignmentID", "estimatedMinutes") VALUES ($1, 90)`,
    [assignmentId]
  );

  // A conflicting event sitting right at the start of the window.
  const busyStart = new Date(windowStart);
  const busyEnd = new Date(windowStart.getTime() + 60 * 60 * 1000);
  const busyAssignment = await pool.query(
    `INSERT INTO "Assignment" ("userID", "courseID", title, points, "dueAt")
     VALUES ($1, $2, 'Unrelated existing event', 0, $3) RETURNING id`,
    [userId, courseId, dueAt]
  );
  await pool.query(
    `INSERT INTO "CalendarEvent" ("assignmentID", title, calendar, "eventStart", "eventEnd")
     VALUES ($1, 'Existing', 'canvas', $2, $3)`,
    [busyAssignment.rows[0].id, busyStart, busyEnd]
  );

  const result = await autoScheduleForUser(userId, { windowStart, windowEnd });

  assert.equal(result.scheduled.length, 1);
  assert.equal(result.scheduled[0].assignmentID, assignmentId);
  assert.ok(new Date(result.scheduled[0].eventStart).getTime() >= busyEnd.getTime(), "must not overlap the existing event");
  assert.equal(result.scheduled[0].calendar, "smart-schedule");
});

test("running it again does not duplicate the block for the same assignment", async () => {
  const windowStart = new Date(); windowStart.setDate(windowStart.getDate() + 1); windowStart.setHours(9, 0, 0, 0);
  const windowEnd = new Date(windowStart); windowEnd.setHours(21, 0, 0, 0);

  const result = await autoScheduleForUser(userId, { windowStart, windowEnd });

  assert.equal(result.scheduled.length, 0, "the assignment from the previous test already has a CalendarEvent");
});

test("priority order beats due-date order end to end: a far-due but high-share assignment is scheduled over a near-due low-share one competing for the same slot", async () => {
  // A single one-hour window -- exactly enough room for ONE 60-minute block.
  const windowStart = new Date(); windowStart.setDate(windowStart.getDate() + 5); windowStart.setHours(9, 0, 0, 0);
  const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000);

  // Both due exactly at the end of this narrow window, so due date alone is a tie --
  // priorityScore (set directly, bypassing the formula) is what must decide the winner.
  const dueAt = windowEnd;

  const low = await pool.query(
    `INSERT INTO "Assignment" ("userID", "courseID", title, points, "dueAt")
     VALUES ($1, $2, 'Low priority', 5, $3) RETURNING id`,
    [userId, courseId, dueAt]
  );
  await pool.query(
    `INSERT INTO "AssignmentDetail" ("assignmentID", "estimatedMinutes", "priorityScore") VALUES ($1, 60, 10)`,
    [low.rows[0].id]
  );

  const high = await pool.query(
    `INSERT INTO "Assignment" ("userID", "courseID", title, points, "dueAt")
     VALUES ($1, $2, 'High priority', 95, $3) RETURNING id`,
    [userId, courseId, dueAt]
  );
  await pool.query(
    `INSERT INTO "AssignmentDetail" ("assignmentID", "estimatedMinutes", "priorityScore") VALUES ($1, 60, 90)`,
    [high.rows[0].id]
  );

  const result = await autoScheduleForUser(userId, { windowStart, windowEnd });

  assert.equal(result.scheduled.length, 1, "only one 60-minute slot exists, so only one of the two can be placed");
  assert.equal(result.scheduled[0].assignmentID, high.rows[0].id, "the higher-priority assignment must win the only slot");
  assert.equal(result.unscheduled.length, 1);
  assert.equal(result.unscheduled[0].assignmentId, low.rows[0].id);
});

test("cleanup: remove the throwaway user (cascades to Assignment/AssignmentDetail/CalendarEvent)", async () => {
  await pool.query("DELETE FROM \"User\" WHERE id = $1", [userId]);
  await pool.query("DELETE FROM \"Course\" WHERE id = $1", [courseId]);
  await pool.end();
});
