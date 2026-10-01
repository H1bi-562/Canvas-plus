// services/scheduler.js
// UC8 -- Calendar Smart Scheduler: automatically place assignments into open
// time blocks on the user's calendar.
//
// This covers the two subtasks planned for this week:
//   1. finding open time -- the slots NOT already taken by an existing
//      CalendarEvent ("conflict handling")
//   2. placing assignments into those slots using how long each assignment
//      is expected to take ("AssignmentDetail"."estimatedMinutes", added by
//      006_analytics_inputs.sql for UC21/UC7) and when it's due
//      ("Assignment"."dueAt")
//
// Deliberately NOT built yet -- left for the coming weeks (UC8 runs through
// Oct.24):
//   - priority-aware placement using UC15's scoring (right now, soonest-due
//     wins the earliest slot; grade weight/class grade aren't considered)
//   - a per-user "working hours" preference -- dailyStartHour/dailyEndHour
//     are caller-supplied defaults (9am-9pm), not read from Config/Settings
//   - rescheduling when an assignment already placed gets edited (a changed
//     due date or estimate does not currently move its CalendarEvent)
//   - timezone handling -- hours are interpreted in the server's local time,
//     which is fine for a single-timezone demo but not for real users

const pool = require('../db');

const MS_PER_MIN = 60 * 1000;

/**
 * Pure. Given the intervals already busy on the calendar and a scheduling
 * window, return the open (free) intervals within daily working hours.
 *
 * busyIntervals: [{ start, end }, ...] -- does not need to be sorted or
 * non-overlapping; two existing events that overlap each other are merged
 * first so they don't create a bogus free sliver between them.
 *
 * Only `dailyStartHour`..`dailyEndHour` (server local time) count as
 * available each day -- e.g. 9..21 means nothing gets scheduled at 2am.
 */
function findOpenBlocks(busyIntervals, windowStart, windowEnd, { dailyStartHour = 9, dailyEndHour = 21 } = {}) {
  if (dailyEndHour <= dailyStartHour) {
    throw new RangeError('dailyEndHour must be after dailyStartHour');
  }

  const sorted = busyIntervals
    .map(({ start, end }) => ({ start: new Date(start), end: new Date(end) }))
    .filter(({ start, end }) => end > start)
    .sort((a, b) => a.start - b.start);

  const merged = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      if (interval.end > last.end) last.end = interval.end;
    } else {
      merged.push({ ...interval });
    }
  }

  const openBlocks = [];
  let cursor = new Date(windowStart);
  const end = new Date(windowEnd);

  while (cursor < end) {
    const dayStart = new Date(cursor);
    dayStart.setHours(dailyStartHour, 0, 0, 0);
    const dayEnd = new Date(cursor);
    dayEnd.setHours(dailyEndHour, 0, 0, 0);

    let segStart = dayStart < cursor ? cursor : dayStart;
    const segEnd = dayEnd > end ? end : dayEnd;

    if (segStart < segEnd) {
      for (const busy of merged) {
        if (busy.end <= segStart || busy.start >= segEnd) continue;
        if (busy.start > segStart) {
          openBlocks.push({ start: new Date(segStart), end: new Date(busy.start) });
        }
        if (busy.end > segStart) segStart = busy.end;
      }
      if (segStart < segEnd) {
        openBlocks.push({ start: new Date(segStart), end: new Date(segEnd) });
      }
    }

    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }

  return openBlocks.filter(b => b.end > b.start);
}

/**
 * Pure. Greedily places each assignment into the earliest open block that
 * both fits its estimated duration and finishes before its due date.
 * Assignments are placed in due-date order (soonest due first), so the
 * assignment with the least slack gets first pick of the open time.
 *
 * assignments: [{ id, estimatedMinutes, dueAt }]
 * openBlocks: the output of findOpenBlocks. Not mutated -- a fresh copy is
 * made internally, consumed as assignments are placed into it.
 *
 * Returns { scheduled: [{ assignmentId, start, end }], unscheduled: [{ assignmentId, reason }] }.
 * An assignment that cannot fit is reported, never silently dropped.
 */
function placeAssignments(assignments, openBlocks) {
  const blocks = openBlocks
    .map(b => ({ start: new Date(b.start), end: new Date(b.end) }))
    .sort((a, b) => a.start - b.start);

  const ordered = [...assignments].sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

  const scheduled = [];
  const unscheduled = [];

  for (const assignment of ordered) {
    if (!assignment.estimatedMinutes) {
      unscheduled.push({ assignmentId: assignment.id, reason: 'no time estimate set' });
      continue;
    }

    const durationMs = assignment.estimatedMinutes * MS_PER_MIN;
    const dueAt = assignment.dueAt ? new Date(assignment.dueAt) : null;

    const blockIndex = blocks.findIndex(block => {
      const usableEnd = dueAt && dueAt < block.end ? dueAt : block.end;
      return usableEnd - block.start >= durationMs;
    });

    if (blockIndex === -1) {
      unscheduled.push({
        assignmentId: assignment.id,
        reason: dueAt ? 'no open block of that length before the due date' : 'no open block of that length',
      });
      continue;
    }

    const block = blocks[blockIndex];
    const start = block.start;
    const placedEnd = new Date(start.getTime() + durationMs);

    scheduled.push({ assignmentId: assignment.id, start, end: placedEnd });

    if (placedEnd.getTime() === block.end.getTime()) {
      blocks.splice(blockIndex, 1);
    } else {
      block.start = placedEnd;
    }
  }

  return { scheduled, unscheduled };
}

/**
 * Orchestration: look up this user's assignments that have a time estimate,
 * are due within the window, and don't already have a calendar block (so
 * re-running this does not pile up duplicate study blocks); look up what's
 * already on the calendar in that window (the conflict-handling input);
 * compute open blocks; place assignments; persist the placements as new
 * CalendarEvent rows tagged calendar: 'smart-schedule' so they're visibly
 * distinct from Canvas-synced or manually-added events.
 */
async function autoScheduleForUser(userID, {
  windowStart = new Date(),
  windowEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  dailyStartHour = 9,
  dailyEndHour = 21,
} = {}) {
  const { rows: candidates } = await pool.query(
    `SELECT a.id, a."dueAt", ad."estimatedMinutes"
       FROM "Assignment" a
       JOIN "AssignmentDetail" ad ON ad."assignmentID" = a.id
      WHERE a."userID" = $1
        AND ad."estimatedMinutes" IS NOT NULL
        AND a."dueAt" BETWEEN $2 AND $3
        AND NOT EXISTS (
          SELECT 1 FROM "CalendarEvent" ce WHERE ce."assignmentID" = a.id
        )`,
    [userID, windowStart, windowEnd]
  );

  const { rows: busyRows } = await pool.query(
    `SELECT ce."eventStart" AS start, ce."eventEnd" AS "end"
       FROM "CalendarEvent" ce
       JOIN "Assignment" a ON a.id = ce."assignmentID"
      WHERE a."userID" = $1
        AND ce."eventStart" < $3 AND ce."eventEnd" > $2`,
    [userID, windowStart, windowEnd]
  );

  const openBlocks = findOpenBlocks(busyRows, windowStart, windowEnd, { dailyStartHour, dailyEndHour });

  const assignments = candidates.map(c => ({
    id: c.id,
    estimatedMinutes: c.estimatedMinutes,
    dueAt: c.dueAt,
  }));

  const { scheduled, unscheduled } = placeAssignments(assignments, openBlocks);

  const inserted = [];
  for (const placement of scheduled) {
    const { rows: [row] } = await pool.query(
      `INSERT INTO "CalendarEvent" ("assignmentID", title, calendar, "eventStart", "eventEnd")
       VALUES ($1, 'Study block', 'smart-schedule', $2, $3)
       RETURNING *`,
      [placement.assignmentId, placement.start, placement.end]
    );
    inserted.push(row);
  }

  return { scheduled: inserted, unscheduled };
}

module.exports = { findOpenBlocks, placeAssignments, autoScheduleForUser };
