import { afterAll, beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/client";
import { assignment, course, reward, rewardRoll, studySession, user } from "../src/schema";

// UC20: the rules the reward tables enforce on their own, whatever code writes to them.
let userID: string, courseID: string, assignmentID: string, sessionID: string;

beforeAll(async () => {
  const [student] = await db.insert(user).values({ name: "Rewards", email: `rewards-${crypto.randomUUID()}@example.invalid` }).returning();
  const [klass] = await db.insert(course).values({ name: "Rewards course", canvasBaseURL: "test://rewards", canvasCourseID: crypto.randomUUID() }).returning();
  const [work] = await db.insert(assignment).values({ userID: student.id, courseID: klass.id, title: "Essay" }).returning();
  const [timer] = await db.insert(studySession).values({ userID: student.id, status: "completed", durationSeconds: 1800 }).returning();
  userID = student.id; courseID = klass.id; assignmentID = work.id; sessionID = timer.id;
});

afterAll(async () => {
  await pool.query('DELETE FROM "User" WHERE id = $1', [userID]);
  await pool.query('DELETE FROM "Course" WHERE id = $1', [courseID]);
  await pool.end();
});

const newReward = (extra: Partial<typeof reward.$inferInsert> = {}) =>
  db.insert(reward).values({ userID, name: "Boba run", rarityPercent: 25, ...extra }).returning();

test("a reward defaults to any trigger, no requirements, and active", async () => {
  const [row] = await newReward();
  expect(row).toMatchObject({ trigger: "any", minStudyMinutes: null, requireOnTime: false, active: true });
});

test("rarity must be a real chance: above 0 and at most 100 percent", async () => {
  await expect(newReward({ rarityPercent: 0 })).rejects.toThrow();
  await expect(newReward({ rarityPercent: -5 })).rejects.toThrow();
  await expect(newReward({ rarityPercent: 100.5 })).rejects.toThrow();
  await expect(newReward({ rarityPercent: 0.5 })).resolves.toBeDefined();
  await expect(newReward({ rarityPercent: 100 })).resolves.toBeDefined();
});

test("requirements are limited to known triggers and a sane study length", async () => {
  await expect(newReward({ trigger: "login" })).rejects.toThrow();
  await expect(newReward({ trigger: "study_session", minStudyMinutes: 0 })).rejects.toThrow();
  await expect(newReward({ trigger: "study_session", minStudyMinutes: 1441 })).rejects.toThrow();
  await expect(newReward({ trigger: "study_session", minStudyMinutes: 45 })).resolves.toBeDefined();
  await expect(newReward({ trigger: "assignment", requireOnTime: true })).resolves.toBeDefined();
});

test("a reward needs a name of 1 to 80 visible characters", async () => {
  await expect(newReward({ name: "   " })).rejects.toThrow();
  await expect(newReward({ name: "x".repeat(81) })).rejects.toThrow();
});

test("an assignment can be rolled for once, even after it is re-marked done", async () => {
  const [prize] = await newReward();
  await db.insert(rewardRoll).values({ userID, trigger: "assignment", assignmentID, rewardID: prize.id, rewardName: prize.name });
  await expect(db.insert(rewardRoll).values({ userID, trigger: "assignment", assignmentID })).rejects.toThrow();
});

test("a study session can be rolled for once, and an empty roll is recorded too", async () => {
  const [empty] = await db.insert(rewardRoll).values({ userID, trigger: "study_session", studySessionID: sessionID }).returning();
  expect(empty).toMatchObject({ rewardID: null, rewardName: null, claimedAt: null });
  await expect(db.insert(rewardRoll).values({ userID, trigger: "study_session", studySessionID: sessionID })).rejects.toThrow();
});

test("a roll's source has to match its trigger, and a won roll has to name its reward", async () => {
  const [prize] = await newReward();
  // Real, never-rolled rows, so only the CHECK constraints can be what refuses these.
  const [work] = await db.insert(assignment).values({ userID, courseID, title: "Quiz" }).returning();
  const [timer] = await db.insert(studySession).values({ userID, status: "completed" }).returning();
  await expect(db.insert(rewardRoll).values({ userID, trigger: "raffle" })).rejects.toThrow();
  await expect(db.insert(rewardRoll).values({ userID, trigger: "study_session", assignmentID: work.id })).rejects.toThrow();
  await expect(db.insert(rewardRoll).values({ userID, trigger: "assignment", studySessionID: timer.id })).rejects.toThrow();
  await expect(db.insert(rewardRoll).values({ userID, trigger: "assignment", assignmentID: work.id, rewardID: prize.id })).rejects.toThrow();
  await expect(db.insert(rewardRoll).values({ userID, trigger: "assignment", assignmentID: work.id, rewardID: prize.id, rewardName: prize.name })).resolves.toBeDefined();
});

test("roll history outlives the reward and the work it was rolled for", async () => {
  const [prize] = await newReward({ name: "Movie night" });
  const [work] = await db.insert(assignment).values({ userID, courseID, title: "Lab" }).returning();
  const [roll] = await db.insert(rewardRoll).values({ userID, trigger: "assignment", assignmentID: work.id, rewardID: prize.id, rewardName: prize.name }).returning();
  await db.delete(reward).where(eq(reward.id, prize.id));
  await db.delete(assignment).where(eq(assignment.id, work.id));
  const [kept] = await db.select().from(rewardRoll).where(eq(rewardRoll.id, roll.id));
  expect(kept).toMatchObject({ rewardID: null, assignmentID: null, rewardName: "Movie night", trigger: "assignment" });
});

test("rewards and rolls go when the student's account does", async () => {
  const [other] = await db.insert(user).values({ name: "Leaving", email: `leaving-${crypto.randomUUID()}@example.invalid` }).returning();
  await db.insert(reward).values({ userID: other.id, name: "Nap", rarityPercent: 10 });
  await db.insert(rewardRoll).values({ userID: other.id, trigger: "assignment" });
  await db.delete(user).where(eq(user.id, other.id));
  expect(await db.select().from(reward).where(eq(reward.userID, other.id))).toHaveLength(0);
  expect(await db.select().from(rewardRoll).where(eq(rewardRoll.userID, other.id))).toHaveLength(0);
});
