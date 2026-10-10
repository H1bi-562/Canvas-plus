// src/queries/aiCache.js
// UC10/UC13 -- cache AI-generated assignment output (summary, subtasks,
// priorityScore) so the same assignment content is never sent to the AI
// model twice. This is the "Add cache for AI output to optimize token usage"
// task (Jace Orozco), ported here from the pre-rewrite services/aiCache.js
// to match this package's query-module convention (see queries/assignments.js):
// ESM, pool imported from ../client, failures normalized to HttpError.
//
// The cache key is a hash of the fields that actually go into the AI prompt
// (title, description, points) -- not a timestamp. That means an assignment
// whose due date moves but whose content is unchanged still hits the cache,
// while an edited title/description correctly misses and regenerates. The
// cached row lives directly in "AssignmentDetail", in the "contentHash"/
// "generatedAt" columns added by drizzle/0001_hot_redwing.sql, so nothing
// new needs to be stood up to use it.
//
// This module has no opinion on which AI provider generates the content --
// withAICache takes a generatorFn and calls it only on a cache miss, so
// whoever builds the actual AI route (UC10: "Create AI route with
// assignment and prompt payload") plugs their real Anthropic/OpenAI call in
// as that function. See apps/web/test/domain/aiCache.test.cjs for a worked
// example with a stub generator.

import crypto from "node:crypto";
import { pool } from "../client";
import { HttpError } from "../errors.js";

/**
 * Hash the fields that actually affect the AI prompt for an assignment.
 * Stable across property order and undefined vs. null vs. missing, so a
 * round-trip through the API (which may send `null` for an empty field)
 * still hashes the same as the original value.
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
      `SELECT summary, subtasks, "priorityScore", "contentHash", "generatedAt"
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
 * was generated for and the current time.
 */
export async function saveGeneratedDetail(assignmentId, contentHash, { summary, subtasks, priorityScore } = {}) {
  try {
    const result = await pool.query(
      `INSERT INTO "AssignmentDetail"
         ("assignmentID", summary, subtasks, "priorityScore", "contentHash", "generatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT ("assignmentID")
       DO UPDATE SET
         summary         = EXCLUDED.summary,
         subtasks        = EXCLUDED.subtasks,
         "priorityScore" = EXCLUDED."priorityScore",
         "contentHash"   = EXCLUDED."contentHash",
         "generatedAt"   = EXCLUDED."generatedAt"
       RETURNING summary, subtasks, "priorityScore", "contentHash", "generatedAt"`,
      [
        assignmentId,
        summary ?? null,
        subtasks ? JSON.stringify(subtasks) : null,
        priorityScore ?? null,
        contentHash,
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
 * The entry point whoever builds the AI route should call instead of
 * hitting the AI model directly.
 *
 *   const detail = await withAICache(assignment, () => callAnthropic(assignment));
 *
 * `assignment` needs { id, title, description, points }. `generatorFn` is
 * only invoked on a cache miss, and must resolve to { summary, subtasks,
 * priorityScore }. The returned object always has `fromCache` so callers
 * (and logs) can tell whether the AI actually ran.
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
