// queries/estimate.js
// UC7 Provide Estimated Time-to-Finish -- the database side.
// Gathers an assignment's workload and the student's pace (learned from completed
// study sessions), then defers to the pure estimator in estimateModel.js. The
// suggestion is offered in the UI; accepting it saves an estimate with source 'ai'.

import { pool } from "../client";
import { HttpError } from "../errors.js";
import { estimateMinutes, clampPace, DEFAULT_MIN_PER_POINT } from "./estimateModel.js";

// Need a few finished sessions before trusting a personal pace over the default.
const MIN_SAMPLE_FOR_PACE = 3;

/**
 * The student's pace in minutes of study time per assignment point, learned from
 * completed study sessions on point-bearing assignments. Falls back to the default
 * (calibrated:false) until there is enough history to trust it.
 */
export async function getUserPace(userID) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(s."durationSeconds"), 0) AS seconds,
            COALESCE(SUM(a.points), 0)            AS points,
            COUNT(DISTINCT a.id)                  AS samples
       FROM "StudySession" s
       JOIN "Assignment" a ON a.id = s."assignmentID"
      WHERE s."userID" = $1 AND s.status = 'completed'
        AND a.points IS NOT NULL AND a.points > 0`,
    [userID]
  );
  const seconds = Number(rows[0].seconds);
  const points = Number(rows[0].points);
  const sampleSize = Number(rows[0].samples);

  if (sampleSize < MIN_SAMPLE_FOR_PACE || points <= 0) {
    return { minutesPerPoint: DEFAULT_MIN_PER_POINT, calibrated: false, sampleSize };
  }
  const observed = seconds / 60 / points;
  return { minutesPerPoint: clampPace(observed), calibrated: true, sampleSize };
}

/** Compute a suggested estimate for one assignment this student owns. */
export async function suggestEstimate(userID, assignmentID) {
  const { rows } = await pool.query(
    `SELECT a.points,
            ad."priorityScore",
            (a.description IS NOT NULL AND length(a.description) > 0) AS "hasDescription",
            (ad.subtasks IS NOT NULL
               AND jsonb_typeof(ad.subtasks) = 'array'
               AND jsonb_array_length(ad.subtasks) > 0) AS "hasSubtasks"
       FROM "Assignment" a
       LEFT JOIN "AssignmentDetail" ad ON ad."assignmentID" = a.id
      WHERE a.id = $1 AND a."userID" = $2`,
    [assignmentID, userID]
  );
  if (rows.length === 0) throw new HttpError(404, "Assignment not found");

  const row = rows[0];
  const pace = await getUserPace(userID);
  const suggestedMinutes = estimateMinutes(
    {
      points: row.points,
      priorityScore: row.priorityScore,
      hasDescription: row.hasDescription,
      hasSubtasks: row.hasSubtasks
    },
    pace
  );

  return {
    assignmentID,
    suggestedMinutes,
    basis: {
      points: row.points,
      priorityScore: row.priorityScore,
      minutesPerPoint: Math.round(pace.minutesPerPoint * 10) / 10,
      calibrated: pace.calibrated
    }
  };
}
