// test/aiCache.test.js
// Covers services/aiCache.js: the AssignmentDetail-backed cache that keeps
// the (not-yet-built) AI route from re-generating output for content it has
// already seen.
//
//   npm test
//
// hashAssignmentContent is pure and runs with no database. The withAICache
// block touches the real database with an @example.invalid user/course and
// deletes them afterwards, same pattern as test/assignmentProgress.test.js.

require('dotenv').config({ quiet: true });

const test   = require('node:test');
const assert = require('node:assert/strict');

const { hashAssignmentContent, withAICache } = require('../services/aiCache');
const pool = require('../db');

// -- hashAssignmentContent: pure rules --------------------------------------

test('same title/description/points hash the same', () => {
  const a = hashAssignmentContent({ title: 'Essay 1', description: 'Write 500 words', points: 20 });
  const b = hashAssignmentContent({ title: 'Essay 1', description: 'Write 500 words', points: 20 });
  assert.equal(a, b);
});

test('changing any prompt field changes the hash', () => {
  const base = hashAssignmentContent({ title: 'Essay 1', description: 'Write 500 words', points: 20 });
  assert.notEqual(base, hashAssignmentContent({ title: 'Essay 1 (revised)', description: 'Write 500 words', points: 20 }));
  assert.notEqual(base, hashAssignmentContent({ title: 'Essay 1', description: 'Write 750 words', points: 20 }));
  assert.notEqual(base, hashAssignmentContent({ title: 'Essay 1', description: 'Write 500 words', points: 25 }));
});

test('null, undefined, and missing fields hash the same', () => {
  const missing   = hashAssignmentContent({ title: 'Essay 1' });
  const undef     = hashAssignmentContent({ title: 'Essay 1', description: undefined, points: undefined });
  const explicit  = hashAssignmentContent({ title: 'Essay 1', description: null, points: null });
  assert.equal(missing, undef);
  assert.equal(missing, explicit);
});

// -- withAICache: touches the database --------------------------------------

const EMAIL  = `aicache-test-${Date.now()}@example.invalid`;
let userId, courseId, assignmentId;

test('setup: throwaway user, course, and assignment', async () => {
  const user = await pool.query(
    `INSERT INTO "User" (email, "hashedPassword") VALUES ($1, 'not-a-real-hash') RETURNING id`,
    [EMAIL]
  );
  userId = user.rows[0].id;

  const course = await pool.query(
    `INSERT INTO "Course" (name) VALUES ('aiCache test course') RETURNING id`
  );
  courseId = course.rows[0].id;

  const assignment = await pool.query(
    `INSERT INTO "Assignment" ("userID", "courseID", title, description, points)
     VALUES ($1, $2, 'Essay 1', 'Write 500 words', 20) RETURNING id`,
    [userId, courseId]
  );
  assignmentId = assignment.rows[0].id;
});

test('a cache miss calls the generator and stores the result', async () => {
  let calls = 0;
  const assignment = { id: assignmentId, title: 'Essay 1', description: 'Write 500 words', points: 20 };

  const result = await withAICache(assignment, async () => {
    calls++;
    return { summary: 'A short essay on...', subtasks: ['Outline', 'Draft', 'Revise'], priorityScore: 7 };
  });

  assert.equal(calls, 1);
  assert.equal(result.fromCache, false);
  assert.equal(result.summary, 'A short essay on...');
});

test('the same content is a cache hit and never calls the generator again', async () => {
  let calls = 0;
  const assignment = { id: assignmentId, title: 'Essay 1', description: 'Write 500 words', points: 20 };

  const result = await withAICache(assignment, async () => {
    calls++;
    return { summary: 'should not be called', subtasks: [], priorityScore: 1 };
  });

  assert.equal(calls, 0, 'generator should not run on a cache hit');
  assert.equal(result.fromCache, true);
  assert.equal(result.summary, 'A short essay on...');
});

test('editing the assignment content is a cache miss and regenerates', async () => {
  let calls = 0;
  const edited = { id: assignmentId, title: 'Essay 1 (revised)', description: 'Write 500 words', points: 20 };

  const result = await withAICache(edited, async () => {
    calls++;
    return { summary: 'Updated summary for the revised prompt', subtasks: ['Outline', 'Draft'], priorityScore: 5 };
  });

  assert.equal(calls, 1, 'changed content should miss the old cache entry');
  assert.equal(result.fromCache, false);
  assert.equal(result.summary, 'Updated summary for the revised prompt');
});

test('cleanup: remove the throwaway user (cascades to Assignment/AssignmentDetail)', async () => {
  await pool.query(`DELETE FROM "User" WHERE id = $1`, [userId]);
  await pool.query(`DELETE FROM "Course" WHERE id = $1`, [courseId]);
  await pool.end();
});
