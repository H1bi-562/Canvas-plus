// apps/web/test/domain/summarize.test.cjs
// Covers src/queries/summarize.js: UC13's generateSummary, and specifically
// its UC10 wiring through the AI output cache (aiCache.js). No API key is
// configured for this user, so every generation takes the deterministic
// extractive path (summarizeModel.js) -- no network call, safe for CI.
//
//   npm test
//
// The cache-hit assertions check "AssignmentDetail"."generatedAt" directly:
// a cache hit must not change it (no regeneration happened), a cache miss
// must (it did).

require("dotenv").config({ quiet: true });

const test   = require("node:test");
const assert = require("node:assert/strict");

const { generateSummary } = require("@canvasplus/database/queries/summarize");
const pool = require("@canvasplus/database").pool;

const EMAIL = `summarize-test-${Date.now()}@example.invalid`;
let userId, courseId, assignmentId;

async function generatedAt() {
  const { rows } = await pool.query(
    `SELECT "generatedAt" FROM "AssignmentDetail" WHERE "assignmentID" = $1`,
    [assignmentId]
  );
  return rows[0]?.generatedAt ?? null;
}

test("setup: throwaway user, course, and assignment (no AI key configured)", async () => {
  const user = await pool.query(
    "INSERT INTO \"User\" (email, name) VALUES ($1, 'x') RETURNING id",
    [EMAIL]
  );
  userId = user.rows[0].id;

  const course = await pool.query(
    `INSERT INTO "Course" (name, "canvasBaseURL", "canvasCourseID")
     VALUES ('summarize test course', 'test://summarize', $1) RETURNING id`,
    [`summarize-${Date.now()}`]
  );
  courseId = course.rows[0].id;

  const assignment = await pool.query(
    `INSERT INTO "Assignment" ("userID", "courseID", title, description, points)
     VALUES ($1, $2, 'Essay 1', 'Write a 500 word essay on the causes of the French Revolution. Cite at least three sources. Due before the next class.', 20)
     RETURNING id`,
    [userId, courseId]
  );
  assignmentId = assignment.rows[0].id;
});

test("generates an extractive summary when no AI key is configured", async () => {
  const result = await generateSummary(userId, assignmentId);
  assert.equal(result.assignmentID, assignmentId);
  assert.ok(result.summary.length > 0);
  assert.equal(result.source, "extractive");
  assert.ok(await generatedAt(), "generatedAt should be stamped on first generation");
});

test("a second call with unchanged content is a cache hit: same summary, no regeneration", async () => {
  const firstStamp = await generatedAt();

  const result = await generateSummary(userId, assignmentId);

  assert.equal(result.source, "extractive");
  assert.equal((await generatedAt()).getTime(), firstStamp.getTime(), "generatedAt must not move on a cache hit");
});

test("editing the assignment's content is a cache miss and regenerates", async () => {
  const firstStamp = await generatedAt();

  await pool.query(
    `UPDATE "Assignment" SET description = $2 WHERE id = $1`,
    [assignmentId, "Write a 750 word essay on the effects of the French Revolution on neighboring countries. Cite at least five sources."]
  );

  const result = await generateSummary(userId, assignmentId);

  assert.ok(result.summary.length > 0);
  assert.notEqual((await generatedAt()).getTime(), firstStamp.getTime(), "generatedAt must move on a cache miss");
});

test("a summary-only generation does not disturb subtasks/priorityScore set by other features", async () => {
  await pool.query(
    `UPDATE "AssignmentDetail" SET subtasks = $2, "priorityScore" = $3 WHERE "assignmentID" = $1`,
    [assignmentId, JSON.stringify(["Outline", "Draft", "Cite sources"]), 65]
  );

  // Force a miss so generateSummary actually writes through saveGeneratedDetail.
  await pool.query(`UPDATE "Assignment" SET title = 'Essay 1 (v3)' WHERE id = $1`, [assignmentId]);
  await generateSummary(userId, assignmentId);

  const { rows: [row] } = await pool.query(
    `SELECT subtasks, "priorityScore" FROM "AssignmentDetail" WHERE "assignmentID" = $1`,
    [assignmentId]
  );
  assert.deepEqual(row.subtasks, ["Outline", "Draft", "Cite sources"]);
  assert.equal(row.priorityScore, 65);
});

test("a 404 for an assignment the user doesn't own, not a 500", async () => {
  await assert.rejects(
    () => generateSummary(userId, "00000000-0000-0000-0000-000000000000"),
    (err) => err.status === 404
  );
});

test("cleanup: remove the throwaway user (cascades to Assignment/AssignmentDetail)", async () => {
  await pool.query("DELETE FROM \"User\" WHERE id = $1", [userId]);
  await pool.query("DELETE FROM \"Course\" WHERE id = $1", [courseId]);
  await pool.end();
});
