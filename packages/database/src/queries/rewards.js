// queries/rewards.js
// UC20 Custom Reward System -- the CRUD half: a student writes, edits and retires their
// own rewards ("boba run", "30 minutes of gaming"), each with a drop chance and the kind
// of finished work that may roll it.
//
// Every statement is scoped to the signed-in user, so one student can never read or
// change another's rewards; a miss is a 404 rather than a 403, which keeps the API from
// confirming that someone else's id exists.
//
// Retiring, not deleting: DELETE sets active = false. "RewardRoll" rows point at the
// reward they won, and the roll history has to keep reading correctly long after a
// reward is retired, so the row stays. A retired reward drops out of the default list
// and is never eligible for a roll; PATCH { active: true } brings it back.
//
// The roll itself (POST /api/rewards/roll, the RNG over these rows) is the separate
// subtask and is not in this file.

import { pool } from "../client";
import { HttpError } from "../errors.js";
import { normalizeReward, publicReward } from "./rewardsModel.js";

// A student has no use for more than this many live rewards, and the cap stops one
// account filling the table for everyone.
export const MAX_ACTIVE_REWARDS = 50;

const COLUMNS = `id, "userID", name, description, "rarityPercent", trigger,
                 "minStudyMinutes", "requireOnTime", active, "createdAt", "updatedAt"`;

/**
 * This student's rewards, newest first.
 * @param {string} userID
 * @param {{ includeInactive?: boolean | string }} [options] retired rewards are left out
 *   unless includeInactive is asked for (the settings screen wants them, a roll does not).
 */
export async function listRewards(userID, { includeInactive = false } = {}) {
  const all = includeInactive === true || includeInactive === "true";
  const { rows } = await pool.query(
    `SELECT ${COLUMNS}
       FROM "Reward"
      WHERE "userID" = $1 AND ($2::boolean OR active)
      ORDER BY active DESC, "createdAt" DESC, id`,
    [userID, all]
  );
  return rows.map(publicReward);
}

/** One of this student's rewards. 404 for anyone else's, and for one that is not there. */
export async function getReward(userID, id) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM "Reward" WHERE id = $1 AND "userID" = $2`,
    [id, userID]
  );
  if (rows.length === 0) throw new HttpError(404, "Reward not found");
  return publicReward(rows[0]);
}

/**
 * Add a reward. name and rarityPercent are required; trigger defaults to "any", meaning
 * either a finished assignment or a finished study session may roll it.
 */
export async function createReward(userID, body = {}) {
  const values = normalizeReward(body, { partial: false });

  const live = await pool.query(
    'SELECT COUNT(*)::int AS count FROM "Reward" WHERE "userID" = $1 AND active',
    [userID]
  );
  if (live.rows[0].count >= MAX_ACTIVE_REWARDS) {
    throw new HttpError(409, `You already have ${MAX_ACTIVE_REWARDS} active rewards. Retire one before adding another.`);
  }

  const { rows } = await pool.query(
    `INSERT INTO "Reward"
       ("userID", name, description, "rarityPercent", trigger, "minStudyMinutes", "requireOnTime", active)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'any'), $6, COALESCE($7, FALSE), COALESCE($8, TRUE))
     RETURNING ${COLUMNS}`,
    [userID, values.name, values.description ?? null, values.rarityPercent,
      values.trigger ?? null, values.minStudyMinutes ?? null,
      values.requireOnTime ?? null, values.active ?? null]
  );
  return publicReward(rows[0]);
}

/**
 * Change some of a reward's fields. Only the keys in the body are touched, and the
 * result is checked as a whole, so changing just the trigger still catches a requirement
 * that no longer applies to it.
 */
export async function updateReward(userID, id, body = {}) {
  const current = await getReward(userID, id);
  const values = normalizeReward(body, { partial: true, current });

  const columns = Object.keys(values);
  const assignments = columns.map((column, i) => `"${column}" = $${i + 3}`).join(", ");
  const { rows } = await pool.query(
    `UPDATE "Reward"
        SET ${assignments}, "updatedAt" = NOW()
      WHERE id = $1 AND "userID" = $2
      RETURNING ${COLUMNS}`,
    [id, userID, ...columns.map(column => values[column])]
  );
  if (rows.length === 0) throw new HttpError(404, "Reward not found");
  return publicReward(rows[0]);
}

/**
 * Retire a reward: it stops being rolled and leaves the default list, but the row stays
 * so the student's roll history still names what they won. Retiring an already retired
 * reward is not an error, so a repeated request is safe.
 */
export async function deleteReward(userID, id) {
  const { rows } = await pool.query(
    `UPDATE "Reward"
        SET active = FALSE, "updatedAt" = NOW()
      WHERE id = $1 AND "userID" = $2
      RETURNING ${COLUMNS}`,
    [id, userID]
  );
  if (rows.length === 0) throw new HttpError(404, "Reward not found");
  return publicReward(rows[0]);
}
