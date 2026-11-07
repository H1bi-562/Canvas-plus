// queries/scheduler.js
// UC8 Calendar Smart Scheduler -- automatically place assignments into open
// time blocks on the user's calendar.
//
// Ported from the pre-rewrite services/scheduler.js (Jace Orozco, commit
// 1191805) into the current Drizzle/pool monorepo convention -- same `pool`
// import and raw-SQL style as queries/aiCache.js and queries/assignments.js,
// in place of the old file's `require('../db')` + Express route.
//
// This covers:
//   1. finding open time -- the slots NOT already taken by an existing
//      CalendarEvent ("conflict handling")
//   2. placing assignments into those slots using how long each assignment
//      is expected to take ("AssignmentDetail"."estimatedMinutes") and when
//      it's due ("Assignment"."dueAt")
//   3. priority-aware placement -- assignments are placed in UC15 Smart
//      Priority Score order (highest first), not just soonest-due-first, so
//      a high-stakes assignment due later still gets picked over a trivial
//      one due sooner when both fit. This is the piece the original file's
//      comments called out as not built yet; it reuses priorityModel.js
//      exactly as assignments.js does, so the order shown here always
//      matches the priority list on the dashboard.
//
// Deliberately still NOT built (left for after presentation, same as the
// original file flagged):
//   - a per-user "working hours" preference -- dailyStartHour/dailyEndHour
//     are still caller-supplied defaults (9am-9pm), not read from Config
//   - rescheduling when an assignment already placed gets edited (a changed
//     due date or estimate does not currently move its CalendarEvent)
//   - timezone handling -- hours are interpreted in the server's local time

import { pool } from "../client";
import { completionStatus } from "./assignmentProgress.js";
import { rankPriorities } from "./priorityModel.js";

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
export function findOpenBlocks(busyIntervals, windowStart, windowEnd, { dailyStartHour = 9, dailyEndHour = 21 } = {}) {
  if (dailyEndHour <= dailyStartHour) {
    throw new RangeError("dailyEndHour must be after dailyStartHour");
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
 *
 * Assignments are placed in UC15 priority-score order (highest `priority`
 * first -- ties broken by the earlier due date, then unset priority last),
 * so the assignment that matters most gets first pick of the open time, not
 * just whichever is due soonest. A due date is still a hard constraint: an
 * assignment never gets placed somewhere it couldn't finish in time.
 *
 * assignments: [{ id, estimatedMinutes, dueAt, priority }] -- `priority` is
 * the UC15 score (higher = more important); pass null/undefined for an
 * assignment with no score (it sorts after every scored one).
 * openBlocks: the output of findOpenBlocks. Not mutated -- a fresh copy is
 * made internally, consumed as assignments are placed into it.
 *
 * Returns { scheduled: [{ assignmentId, start, end }], unscheduled: [{ assignmentId, reason }] }.
 * An assignment that cannot fit is reported, never silently dropped.
 */
export function placeAssignments(assignments, openBlocks) {
  const blocks = openBlocks
    .map(b => ({ start: new Date(b.start), end: new Date(b.end) }))
    .sort((a, b) => a.start - b.start);

  const ordered = [...assignments].sort((a, b) => {
    const pa = a.priority ?? -Infinity;
    const pb = b.priority ?? -Infinity;
    if (pa !== pb) return pb - pa; // highest priority first
    return new Date(a.dueAt ?? 8640000000000000) - new Date(b.dueAt ?? 8640000000000000);
  });

  const scheduled = [];
  const unscheduled = [];

  for (const assignment of ordered) {
    if (!assignment.estimatedMinutes) {
      unscheduled.push({ assignmentId: assignment.id, reason: "no time estimate set" });
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
        reason: dueAt ? "no open block of that length before the due date" : "no open block of that length",
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
 * Orchestration: look up all of this user's assignments (needed so UC15's
 * priority score is computed against the student's full open workload, the
 * same way the dashboard's priority list is), find which of them are actual
 * scheduling candidates (have a time estimate, due within the window, and
 * don't already have a calendar block so re-running this doesn't pile up
 * duplicate study blocks), look up what's already on the calendar in that
 * window (the conflict-handling input), compute open blocks, place the
 * candidates in priority order, and persist the placements as new
 * CalendarEvent rows tagged calendar: 'smart-schedule' so they're visibly
 * distinct from Canvas-synced or manually-added events.
 */
export async function autoScheduleForUser(userID, {
  windowStart = new Date(),
  windowEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  dailyStartHour = 9,
  dailyEndHour = 21,
} = {}) {
  // Everything priorityModel.rankPriorities needs to score the student's full
  // open workload -- the same fields assignments.js's listAssignments reads.
  const { rows: allAssignments } = await pool.query(
    `SELECT
        a.id, a.title, a.description, a.points, a."dueAt", a."availableUntil", a."courseID",
        a."submittedAt", a."submissionState", a.late, a.missing, a.excused, a."completedAt",
        ad.subtasks, ad."priorityScore", ad."estimatedMinutes",
        COALESCE(logged.seconds, 0)::INTEGER AS "loggedSeconds"
       FROM "Assignment" a
       LEFT JOIN "AssignmentDetail" ad ON ad."assignmentID" = a.id
       LEFT JOIN LATERAL (
         SELECT SUM(s."durationSeconds") AS seconds
           FROM "StudySession" s
          WHERE s."assignmentID" = a.id AND s."userID" = a."userID" AND s.status = 'completed'
       ) logged ON TRUE
      WHERE a."userID" = $1`,
    [userID]
  );

  const now = Date.now();
  const rows = allAssignments.map(row => ({ ...row, completionStatus: completionStatus(row, now) }));
  const ranked = rankPriorities(rows, now);

  // Candidates: estimated, due inside the window, and not already scheduled.
  const { rows: scheduledIds } = await pool.query(
    `SELECT DISTINCT a.id
       FROM "Assignment" a
       JOIN "CalendarEvent" ce ON ce."assignmentID" = a.id
      WHERE a."userID" = $1`,
    [userID]
  );
  const alreadyScheduled = new Set(scheduledIds.map(r => r.id));

  const candidates = rows.filter(row =>
    row.estimatedMinutes != null &&
    row.dueAt &&
    new Date(row.dueAt) >= windowStart && new Date(row.dueAt) <= windowEnd &&
    !alreadyScheduled.has(row.id)
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
    priority: ranked.get(c.id)?.score ?? null,
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
