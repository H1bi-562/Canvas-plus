// queries/priorityModel.js
// UC15 pure Smart Priority Scoring: how important each open assignment is
// compared to the student's other open work. No I/O, so the rules stay
// unit-testable (see apps/web/test/priorityModel.test.ts); assignments.js
// attaches the result to every listed row.
//
//   score = 100 × (0.55 urgency + 0.30 impact + 0.15 effort), each factor 0..1
//
//   urgency  slack = hours until due minus hours of work left; 1 once the
//            slack is gone (or the work is overdue), halving every 3 days of
//            slack after that, 0 with no due date
//   impact   the assignment's share of its course's points, relative to the
//            largest share among the open work
//   effort   minutes of work left (estimate minus logged study time), relative
//            to the most work left on any open assignment
//
// Open means pending, overdue or missing, and still accepting submissions
// (Canvas's lock date has not passed). Everything else is unranked, so a
// Canvas submission takes an assignment off the list on the next sync.

import { estimateMinutes } from "./estimateModel.js";

export const WEIGHTS = { urgency: 0.55, impact: 0.3, effort: 0.15 };
const SLACK_HALF_LIFE_HOURS = 72;
const OPEN_STATUSES = new Set(["pending", "overdue", "missing"]);
const HOUR_MS = 60 * 60 * 1000;

const time = (value) => (value ? new Date(value).getTime() : null);

/** Unfinished, and Canvas still takes a submission. */
export function isOpen(row, now = Date.now()) {
  const lockedAt = time(row.availableUntil);
  return OPEN_STATUSES.has(row.completionStatus) && (lockedAt === null || lockedAt > now);
}

/** The student's estimate (or the UC7 default for its size) minus time already studied. */
function minutesLeft(row) {
  const planned = row.estimatedMinutes ?? estimateMinutes({
    points: row.points,
    hasDescription: Boolean(row.description),
    hasSubtasks: Array.isArray(row.subtasks) && row.subtasks.length > 0
  });
  return Math.max(0, planned - (row.loggedSeconds || 0) / 60);
}

const formatWork = (minutes) =>
  minutes >= 60 ? `~${Math.round(minutes / 60)}h of work left` : `~${Math.max(5, Math.round(minutes / 5) * 5)}m of work left`;

/**
 * Score and rank every open row. Returns Map<id, { score, rank, reason }>;
 * rows missing from the map are finished or locked. A stored score (the UC10
 * AI priority) wins over the computed one, as it always has.
 */
export function rankPriorities(rows, now = Date.now()) {
  const coursePoints = new Map();
  for (const row of rows) {
    coursePoints.set(row.courseID, (coursePoints.get(row.courseID) ?? 0) + Math.max(0, row.points ?? 0));
  }

  const open = rows.filter((row) => isOpen(row, now)).map((row) => {
    const work = minutesLeft(row);
    const due = time(row.dueAt);
    const slackHours = due === null ? null : (due - now) / HOUR_MS - work / 60;
    const total = coursePoints.get(row.courseID);
    return {
      row,
      work,
      overdue: due !== null && due <= now,
      urgency: slackHours === null ? 0 : slackHours <= 0 ? 1 : 0.5 ** (slackHours / SLACK_HALF_LIFE_HOURS),
      share: row.points > 0 && total > 0 ? row.points / total : 0
    };
  });

  const maxShare = Math.max(0, ...open.map((item) => item.share));
  const maxWork = Math.max(0, ...open.map((item) => item.work));

  const scored = open.map((item) => {
    const factors = {
      urgency: WEIGHTS.urgency * item.urgency,
      impact: maxShare ? WEIGHTS.impact * (item.share / maxShare) : 0,
      effort: maxWork ? WEIGHTS.effort * (item.work / maxWork) : 0
    };
    const computed = Math.round(100 * (factors.urgency + factors.impact + factors.effort));

    // Explain the score with its two biggest contributors (5+ points each).
    const phrases = {
      urgency: item.overdue ? "Overdue" : item.urgency >= 0.5 ? "Due soon" : "Coming up",
      impact: `${Math.max(1, Math.round(item.share * 100))}% of course points`,
      effort: formatWork(item.work)
    };
    const reason = Object.entries(factors)
      .filter(([, value]) => value >= 0.05)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([factor]) => phrases[factor])
      .join(" · ") || (item.row.dueAt ? "Plenty of time" : "No due date");

    return { row: item.row, score: item.row.priorityScore ?? computed, reason };
  });

  // Highest score first; ties go to the earlier due date, then the title.
  scored.sort((a, b) =>
    b.score - a.score ||
    (time(a.row.dueAt) ?? Infinity) - (time(b.row.dueAt) ?? Infinity) ||
    String(a.row.title).localeCompare(String(b.row.title))
  );

  return new Map(scored.map((item, index) => [item.row.id, { score: item.score, rank: index + 1, reason: item.reason }]));
}
