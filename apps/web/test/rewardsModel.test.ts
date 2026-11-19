// UC20 reward validation rules. Pure -- no database, runs in the normal `pnpm test`.
import { test, expect } from "vitest";
import { normalizeReward, publicReward, MAX_NAME_CHARS, MAX_STUDY_MINUTES } from "@canvasplus/database/queries/rewardsModel";

const ok = { name: "Boba run", rarityPercent: 25 };

test("a create keeps the fields given and leaves the rest to the table's defaults", () => {
  expect(normalizeReward(ok)).toEqual({ name: "Boba run", rarityPercent: 25 });
  expect(normalizeReward({ ...ok, trigger: "study_session", minStudyMinutes: 45 }))
    .toEqual({ name: "Boba run", rarityPercent: 25, trigger: "study_session", minStudyMinutes: 45 });
});

test("a create needs a name and a rarity", () => {
  expect(() => normalizeReward({ rarityPercent: 25 })).toThrow(/name is required/);
  expect(() => normalizeReward({ name: "Boba run" })).toThrow(/rarityPercent is required/);
});

test("names are trimmed and collapsed, and have to be 1 to 80 visible characters", () => {
  expect(normalizeReward({ ...ok, name: "  Movie   night  " }).name).toBe("Movie night");
  expect(() => normalizeReward({ ...ok, name: "   " })).toThrow(/1 to 80/);
  expect(() => normalizeReward({ ...ok, name: "x".repeat(MAX_NAME_CHARS + 1) })).toThrow(/1 to 80/);
  expect(normalizeReward({ ...ok, name: "x".repeat(MAX_NAME_CHARS) }).name).toHaveLength(MAX_NAME_CHARS);
});

test("rarity has to be a real drop chance, and is kept to two decimals", () => {
  expect(() => normalizeReward({ ...ok, rarityPercent: 0 })).toThrow(/above 0/);
  expect(() => normalizeReward({ ...ok, rarityPercent: -5 })).toThrow(/above 0/);
  expect(() => normalizeReward({ ...ok, rarityPercent: 100.5 })).toThrow(/at most 100/);
  expect(() => normalizeReward({ ...ok, rarityPercent: "soon" })).toThrow(/must be a number/);
  expect(normalizeReward({ ...ok, rarityPercent: 100 }).rarityPercent).toBe(100);
  expect(normalizeReward({ ...ok, rarityPercent: 12.3456 }).rarityPercent).toBe(12.35);
  expect(normalizeReward({ ...ok, rarityPercent: "7.5" }).rarityPercent).toBe(7.5);
});

test("the trigger is limited to the three the table allows", () => {
  expect(normalizeReward({ ...ok, trigger: "assignment" }).trigger).toBe("assignment");
  expect(() => normalizeReward({ ...ok, trigger: "login" })).toThrow(/trigger must be one of/);
});

test("a study length has to be a whole number of minutes inside a day", () => {
  expect(() => normalizeReward({ ...ok, minStudyMinutes: 0 })).toThrow(/whole number/);
  expect(() => normalizeReward({ ...ok, minStudyMinutes: MAX_STUDY_MINUTES + 1 })).toThrow(/whole number/);
  expect(() => normalizeReward({ ...ok, minStudyMinutes: 30.5 })).toThrow(/whole number/);
  expect(normalizeReward({ ...ok, minStudyMinutes: null }).minStudyMinutes).toBeNull();
});

test("a requirement the trigger cannot satisfy is refused", () => {
  expect(() => normalizeReward({ ...ok, trigger: "assignment", minStudyMinutes: 45 }))
    .toThrow(/only applies to study session rolls/);
  expect(() => normalizeReward({ ...ok, trigger: "study_session", requireOnTime: true }))
    .toThrow(/only applies to assignment rolls/);
  expect(normalizeReward({ ...ok, trigger: "any", minStudyMinutes: 45, requireOnTime: true }))
    .toMatchObject({ minStudyMinutes: 45, requireOnTime: true });
});

test("an update touches only the keys sent, and refuses an empty one", () => {
  expect(normalizeReward({ name: "Nap" }, { partial: true })).toEqual({ name: "Nap" });
  expect(() => normalizeReward({}, { partial: true })).toThrow(/No reward fields to update/);
  expect(() => normalizeReward({ unknown: 1 }, { partial: true })).toThrow(/No reward fields to update/);
});

test("an update is checked against the reward as it will end up, not just what changed", () => {
  const current = { trigger: "study_session", minStudyMinutes: 45, requireOnTime: false };
  // Switching this reward to assignment rolls leaves a study length that cannot apply.
  expect(() => normalizeReward({ trigger: "assignment" }, { partial: true, current }))
    .toThrow(/only applies to study session rolls/);
  // Clearing the study length in the same request makes it valid.
  expect(normalizeReward({ trigger: "assignment", minStudyMinutes: null }, { partial: true, current }))
    .toEqual({ trigger: "assignment", minStudyMinutes: null });
});

test("booleans are booleans, not strings", () => {
  expect(() => normalizeReward({ ...ok, active: "false" })).toThrow(/true or false/);
  expect(normalizeReward({ ...ok, active: false }).active).toBe(false);
});

test("publicReward returns the student's fields and not the owning user id", () => {
  const row = { id: "r1", userID: "u1", name: "Boba run", description: null, rarityPercent: 25,
    trigger: "any", minStudyMinutes: null, requireOnTime: false, active: true,
    createdAt: "t", updatedAt: "t" };
  expect(publicReward(row)).not.toHaveProperty("userID");
  expect(publicReward(row)).toMatchObject({ id: "r1", name: "Boba run", rarityPercent: 25 });
});
