import { afterEach, expect, test, vi } from "vitest";
import { nextStep, needsOnboarding, needsWalkthrough, loadGate, WIZARD_STEPS } from "@/lib/onboarding";

afterEach(() => vi.restoreAllMocks());

test("loadGate returns null and logs when the lookup fails", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await loadGate(async () => { throw new Error("db down"); })).toBeNull();
  expect(log).toHaveBeenCalledWith("Onboarding check failed:", expect.any(Error));
});

test("loadGate passes a loaded state through", async () => {
  const state = { steps: {}, completedAt: null, nextStep: "canvas" as const };
  expect(await loadGate(async () => state)).toBe(state);
});

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

test("the wizard has three steps; the tour is the in-app walkthrough", () => {
  expect([...WIZARD_STEPS]).toEqual(["canvas", "google", "sync"]);
});

test("needsWalkthrough is true only after the wizard and before the tour is recorded", () => {
  const done = "2026-10-27T00:00:00Z";
  expect(needsWalkthrough({ steps: { sync: "done" }, completedAt: done, nextStep: "tour" })).toBe(true);
  expect(needsWalkthrough({ steps: { tour: "skipped" }, completedAt: done, nextStep: null })).toBe(false);
  expect(needsWalkthrough({ steps: {}, completedAt: null, nextStep: "canvas" })).toBe(false);
  expect(needsWalkthrough(null)).toBe(false);
});
