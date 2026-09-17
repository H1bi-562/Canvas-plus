// services/aiCache.js
// UC10/UC13 -- cache AI-generated assignment output (summary, subtasks,
// priorityScore) so the same assignment content is never sent to the AI
// model twice. This is the "Add cache for AI output to optimize token usage"
// task (Jace Orozco).
//
// The cache key is a hash of the fields that actually go into the AI prompt
// (title, description, points) -- not a timestamp. That means an assignment
// whose due date moves but whose content is unchanged still hits the cache,
// while an edited title/description correctly misses and regenerates. The
// cached row lives directly in "AssignmentDetail" (see
// 007_ai_output_cache.sql for the two columns this adds), so nothing new
// needs to be stood up to use it.
//
// This module has no opinion on which AI provider generates the content --
// `withAICache` takes a `generatorFn` and calls it only on a cache miss, so
// whoever builds the actual AI route (UC10: "Create AI route with assignment
// and prompt payload") plugs their real Anthropic/OpenAI call in as that
// function. See test/aiCache.test.js for a worked example with a stub
// generator.

const crypto = require('crypto');
const pool = require('../db');

/**
 * Hash the fields that actually affect the AI prompt for an assignment.
 * Stable across property order and undefined vs. null vs. missing, so a
 * round-trip through the API (which may send `null` for an empty field)
 * still hashes the same as the original value.
 */
function hashAssignmentContent({ title, description, points }) {
  const normalized = JSON.stringify({
    title: title ?? '',
    description: description ?? '',
    points: points ?? null,
  });
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Look up a cached AssignmentDetail row for this exact content hash.
 * Returns null on a miss (no row yet, or the row is for older content).
 */
async function getCachedDetail(assignmentId, contentHash) {
  const result = await pool.query(
    `SELECT summary, subtasks, "priorityScore", "contentHash", "generatedAt"
       FROM "AssignmentDetail"
      WHERE "assignmentID" = $1 AND "contentHash" = $2`,
    [assignmentId, contentHash]
  );
  return result.rows[0] || null;
}

/**
 * Upsert freshly-generated AI output, stamping it with the content hash it
 * was generated for and the current time.
 */
async function saveGeneratedDetail(assignmentId, contentHash, { summary, subtasks, priorityScore }) {
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
}

/**
 * The entry point whoever builds the AI route should call instead of hitting
 * the AI model directly.
 *
 *   const detail = await withAICache(assignment, () => callAnthropic(assignment));
 *
 * `assignment` needs { id, title, description, points }. `generatorFn` is
 * only invoked on a cache miss, and must resolve to { summary, subtasks,
 * priorityScore }. The returned object always has `fromCache` so callers
 * (and logs) can tell whether the AI actually ran.
 */
async function withAICache(assignment, generatorFn) {
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

module.exports = { hashAssignmentContent, getCachedDetail, saveGeneratedDetail, withAICache };
