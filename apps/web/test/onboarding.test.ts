import { expect, test } from "vitest";
import { nextStep, needsOnboarding } from "@/lib/onboarding";

test("nextStep follows the fixed order and ignores out-of-order records", () => {
  expect(nextStep({})).toBe("canvas");
  expect(nextStep({ canvas: "done", google: "skipped" })).toBe("sync");
  expect(nextStep({ sync: "done" })).toBe("canvas");
  expect(nextStep({ canvas: "done", google: "done", sync: "done", tour: "done" })).toBeNull();
});

test("needsOnboarding is true only for loaded, unfinished progress", () => {
  expect(needsOnboarding({ steps: {}, completedAt: null, nextStep: "canvas" })).toBe(true);
  expect(needsOnboarding({ steps: {}, completedAt: "2026-10-24T00:00:00Z", nextStep: "canvas" })).toBe(false);
  expect(needsOnboarding(null)).toBe(false);
});
