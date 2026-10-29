// src/queries/aiCache.js
// UC10/UC13 -- cache AI-generated assignment output so the same content is
// never sent to the AI model twice. Originally built against a single
// combined "generate everything" AI call (summary+subtasks+priorityScore);
// now wired into UC13's summarize.js, which generates (and caches) only the
// summary -- see the comment on contentHash/generatedAt/summarySource in
// schema.ts for why the hash is scoped per-feature rather than shared.
//
// The cache key is a hash of the fields that actually feed the AI prompt
// (title, description, points) -- not a timestamp. That means an assignment
// whose due date moves but whose content is unchanged still hits the cache,
// while an edited title/description correctly misses and regenerates. The
// cached row lives directly in "AssignmentDetail", in the "contentHash"/
// "generatedAt"/"summarySource" columns.
//
// saveGeneratedDetail only overwrites the fields it's given (COALESCE, same
// convention as queries/assignments.js's saveAssignmentDetails) -- summary,
// subtasks, and priorityScore can each be written independently by
// different features without one call wiping out another's data. A caller
// that omits subtasks/priorityScore (like summarize.js, which only ever
// generates a summary) leaves whatever is already stored there untouched.

import crypto from "node:crypto";
import { pool } from "../client";
import { HttpError } from "../errors.js";

/**
 * Hash the fields that actually affect the AI prompt for an assignment.
 * Stable across property order and undefined vs. null vs. missing, so a
 * round-trip through the API (which may send `null` for an empty field)
 * still hashes the same as the original value. A caller whose prompt
 * doesn't use `points` (e.g. a summary, which only reads title/description)
 * should pass `points: null` consistently so the hash only varies with the
 * fields that actually matter to it.
 */
export function hashAssignmentContent({ title, description, points }) {
  const normalized = JSON.stringify({
    title: title ?? "",
    description: description ?? "",
    points: points ?? null,
  });
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Look up a cached AssignmentDetail row for this exact content hash.
 * Returns null on a miss (no row yet, or the row is for older content).
 */
export async function getCachedDetail(assignmentId, contentHash) {
  try {
    const result = await pool.query(
      `SELECT summary, subtasks, "priorityScore", "contentHash", "generatedAt", "summarySource"
         FROM "AssignmentDetail"
        WHERE "assignmentID" = $1 AND "contentHash" = $2`,
      [assignmentId, contentHash]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error("Get cached detail error:", err.message);
    throw new HttpError(500, "Failed to read AI output cache");
  }
}

/**
 * Upsert freshly-generated AI output, stamping it with the content hash it
 * was generated for and the current time. Only the fields passed in are
 * written -- summary/subtasks/priorityScore each fall back (via COALESCE)
 * to whatever is already stored when omitted, so one feature's cache write
 * never clobbers another's data in the same AssignmentDetail row.
 */
export async function saveGeneratedDetail(assignmentId, contentHash, { summary, subtasks, priorityScore, source } = {}) {
  try {
    const result = await pool.query(
      `INSERT INTO "AssignmentDetail"
         ("assignmentID", summary, subtasks, "priorityScore", "contentHash", "generatedAt", "summarySource")
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)
       ON CONFLICT ("assignmentID")
       DO UPDATE SET
         summary         = COALESCE(EXCLUDED.summary, "AssignmentDetail".summary),
         subtasks        = COALESCE(EXCLUDED.subtasks, "AssignmentDetail".subtasks),
         "priorityScore" = COALESCE(EXCLUDED."priorityScore", "AssignmentDetail"."priorityScore"),
         "contentHash"   = EXCLUDED."contentHash",
         "generatedAt"   = EXCLUDED."generatedAt",
         "summarySource" = COALESCE(EXCLUDED."summarySource", "AssignmentDetail"."summarySource")
       RETURNING summary, subtasks, "priorityScore", "contentHash", "generatedAt", "summarySource"`,
      [
        assignmentId,
        summary ?? null,
        subtasks ? JSON.stringify(subtasks) : null,
        priorityScore ?? null,
        contentHash,
        source ?? null,
      ]
    );
    return result.rows[0];
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("Save generated detail error:", err.message);
    throw new HttpError(500, "Failed to save AI output");
  }
}

/**
 * The entry point whoever builds an AI-generating route should call instead
 * of hitting the AI model directly.
 *
 *   const detail = await withAICache(assignment, () => callAnthropic(assignment));
 *
 * `assignment` needs { id, title, description, points }. `generatorFn` is
 * only invoked on a cache miss, and must resolve to { summary, subtasks,
 * priorityScore, source }. The returned object always has `fromCache` so
 * callers (and logs) can tell whether the AI actually ran.
 */
export async function withAICache(assignment, generatorFn) {
  const contentHash = hashAssignmentContent(assignment);

  const cached = await getCachedDetail(assignment.id, contentHash);
  if (cached) {
    console.log(`[aiCache] hit for assignment ${assignment.id} -- skipped AI call`);
    return { ...cached, fromCache: true };
  }

  console.log(`[aiCache] miss for assignment ${assignment.id} -- calling generator`);
  const generated = await generatorFn();
  const saved = await saveGeneratedDetail(assignment.id, contentHash, generated);
  return { ...saved, fromCache: false };
}
