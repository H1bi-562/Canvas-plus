// queries/rewardsModel.js
// UC20 Custom Reward System -- the rules a reward has to satisfy, with no database
// involved. rewards.js uses this to clean a request body before it ever reaches SQL,
// so a bad field comes back as a 400 with a sentence the student can act on instead of
// a raw CHECK violation. Pure, so it is unit-tested in the normal `pnpm test`.
//
// The limits here mirror the CHECK constraints on "Reward" (schema.ts). The two rules
// the table cannot express are also enforced here: a study length only means something
// on a study session roll, and "finished on time" only means something on an
// assignment roll.

import { HttpError } from "../errors.js";

export const TRIGGERS = ["any", "assignment", "study_session"];
export const MAX_NAME_CHARS = 80;
export const MAX_DESCRIPTION_CHARS = 500;
export const MIN_STUDY_MINUTES = 1;
export const MAX_STUDY_MINUTES = 1440;

function cleanName(value) {
  if (typeof value !== "string") throw new HttpError(400, "name must be text");
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > MAX_NAME_CHARS) {
    throw new HttpError(400, `name must be 1 to ${MAX_NAME_CHARS} characters`);
  }
  return name;
}

function cleanDescription(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new HttpError(400, "description must be text");
  const text = value.trim();
  if (!text) return null;
  if (text.length > MAX_DESCRIPTION_CHARS) {
    throw new HttpError(400, `description must be ${MAX_DESCRIPTION_CHARS} characters or fewer`);
  }
  return text;
}

function cleanRarity(value) {
  const rarity = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof rarity !== "number" || !Number.isFinite(rarity)) throw new HttpError(400, "rarityPercent must be a number");
  if (rarity <= 0 || rarity > 100) throw new HttpError(400, "rarityPercent must be above 0 and at most 100");
  // Two decimals is as fine as a drop chance ever needs to be, and it keeps the stored
  // value from carrying float noise into what the student sees.
  return Math.round(rarity * 100) / 100;
}

function cleanTrigger(value) {
  if (typeof value !== "string" || !TRIGGERS.includes(value)) {
    throw new HttpError(400, `trigger must be one of ${TRIGGERS.join(", ")}`);
  }
  return value;
}

function cleanStudyMinutes(value) {
  if (value === null || value === undefined || value === "") return null;
  const minutes = typeof value === "string" ? Number(value) : value;
  if (!Number.isInteger(minutes) || minutes < MIN_STUDY_MINUTES || minutes > MAX_STUDY_MINUTES) {
    throw new HttpError(400, `minStudyMinutes must be a whole number from ${MIN_STUDY_MINUTES} to ${MAX_STUDY_MINUTES}`);
  }
  return minutes;
}

function cleanBoolean(value, field) {
  if (typeof value !== "boolean") throw new HttpError(400, `${field} must be true or false`);
  return value;
}

/**
 * Turn a request body into exactly the columns "Reward" accepts.
 *
 * On a create (partial false) name and rarityPercent are required and the rest take
 * the table's defaults. On an update (partial true) only the keys actually present are
 * returned, so a PATCH never overwrites a field the student did not send.
 *
 * Unknown keys are dropped rather than rejected, so a future column on the client
 * cannot break an older server.
 *
 * @param {Record<string, unknown>} input
 * @param {{ partial?: boolean, current?: Record<string, unknown> }} [options]
 *   current is the reward as stored, used on a partial update to check the finished
 *   values rather than only the ones being changed.
 */
export function normalizeReward(input = {}, { partial = false, current = null } = {}) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(400, "Expected a reward object");
  }
  const has = key => Object.hasOwn(input, key) && input[key] !== undefined;
  const values = {};

  if (has("name")) values.name = cleanName(input.name);
  else if (!partial) throw new HttpError(400, "name is required");

  if (has("rarityPercent")) values.rarityPercent = cleanRarity(input.rarityPercent);
  else if (!partial) throw new HttpError(400, "rarityPercent is required");

  if (has("description")) values.description = cleanDescription(input.description);
  if (has("trigger")) values.trigger = cleanTrigger(input.trigger);
  if (has("minStudyMinutes")) values.minStudyMinutes = cleanStudyMinutes(input.minStudyMinutes);
  if (has("requireOnTime")) values.requireOnTime = cleanBoolean(input.requireOnTime, "requireOnTime");
  if (has("active")) values.active = cleanBoolean(input.active, "active");

  if (partial && Object.keys(values).length === 0) throw new HttpError(400, "No reward fields to update");

  // Check the reward as it will end up, not just the fields in this request, so a PATCH
  // that changes only the trigger still catches a now-meaningless requirement.
  const settled = {
    trigger: values.trigger ?? current?.trigger ?? "any",
    minStudyMinutes: values.minStudyMinutes ?? (has("minStudyMinutes") ? null : current?.minStudyMinutes ?? null),
    requireOnTime: values.requireOnTime ?? (has("requireOnTime") ? false : current?.requireOnTime ?? false)
  };
  if (settled.trigger === "assignment" && settled.minStudyMinutes !== null) {
    throw new HttpError(400, "minStudyMinutes only applies to study session rolls");
  }
  if (settled.trigger === "study_session" && settled.requireOnTime) {
    throw new HttpError(400, "requireOnTime only applies to assignment rolls");
  }
  return values;
}

/** The reward as the API returns it. Everything on the row is the student's own. */
export function publicReward(row) {
  return {
    id: row.id, name: row.name, description: row.description,
    rarityPercent: row.rarityPercent, trigger: row.trigger,
    minStudyMinutes: row.minStudyMinutes, requireOnTime: row.requireOnTime,
    active: row.active, createdAt: row.createdAt, updatedAt: row.updatedAt
  };
}
