// queries/estimateModel.js
// UC7 pure estimator: how long an assignment should take, from its workload
// (points, priority, whether it has a description or AI subtasks) and the
// student's pace in minutes-per-point. No I/O, so the rules stay unit-testable
// (see apps/web/test/estimateModel.test.ts). estimate.js supplies the inputs.

// Mirrors the CHECK on "AssignmentDetail"."estimatedMinutes" (1..6000); a small
// floor keeps a tiny assignment from suggesting "1 minute".
export const MIN_ESTIMATE = 5;
export const MAX_ESTIMATE = 6000;

// Minutes of work per point before personalization: ~5h for a 100-point project,
// ~30m for a 10-point quiz.
export const DEFAULT_MIN_PER_POINT = 3;
// Assignments Canvas gives no point value still get a sensible starting guess.
const NO_POINTS_BASELINE = 45;
// Clamp pace so one marathon (or 2-minute) session can't distort every estimate.
const MIN_MIN_PER_POINT = 0.5;
const MAX_MIN_PER_POINT = 30;

/** A trusted minutes-per-point, defaulting when the value is missing or absurd. */
export function clampPace(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_MIN_PER_POINT;
  }
  return Math.max(MIN_MIN_PER_POINT, Math.min(MAX_MIN_PER_POINT, value));
}

/** Round to the nearest 5 minutes, then clamp to the allowed range. */
function clampRound(minutes) {
  const rounded = Math.round(minutes / 5) * 5;
  return Math.max(MIN_ESTIMATE, Math.min(MAX_ESTIMATE, rounded));
}

/**
 * Suggest minutes-to-finish from an assignment's workload and the student's pace.
 * Pure -- every rule lives here so it can be tested without a database.
 */
export function estimateMinutes(assignment = {}, pace = {}) {
  const { points, priorityScore, hasDescription = false, hasSubtasks = false } = assignment;
  const minutesPerPoint = clampPace(pace.minutesPerPoint);

  // Points are the best size signal; fall back to a flat baseline without them.
  let minutes = points != null && points > 0 ? points * minutesPerPoint : NO_POINTS_BASELINE;

  // Higher-priority work (UC10/UC15 score) tends to run longer than raw points imply.
  if (priorityScore != null) {
    if (priorityScore >= 70) minutes *= 1.25;
    else if (priorityScore >= 40) minutes *= 1.1;
  }
  // A broken-down (subtasks) or richly described task is usually more involved.
  if (hasSubtasks) minutes *= 1.15;
  else if (hasDescription) minutes *= 1.05;

  return clampRound(minutes);
}
