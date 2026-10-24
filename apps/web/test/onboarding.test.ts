import { afterEach, expect, test, vi } from "vitest";
import { nextStep, needsOnboarding, loadGate } from "@/lib/onboarding";
import { TOUR_CARDS } from "@/app/(onboarding)/onboarding/_components/tourCards";
import { applyThemeChoice } from "@/app/(onboarding)/onboarding/_lib/theme";

const layout = vi.hoisted(() => ({
  saveTheme: vi.fn(async (theme: string) => ({ theme, layout: [] as unknown[], isDefault: true, updatedAt: null as string | null })),
  fetchLayout: vi.fn()
}));
vi.mock("@/app/(dashboard)/assignments/_api/layoutApi", () => layout);

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

const KEY = "canvasplus:preferences:u1";

test("tour cards are complete and in order", () => {
  expect(TOUR_CARDS.map((c) => c.id)).toEqual(["dashboard", "assignments", "timer", "analytics", "calendar", "settings"]);
  for (const card of TOUR_CARDS) {
    expect(card.title).toBeTruthy();
    expect(card.bullets.length).toBeGreaterThan(0);
    expect(card.where).toBeTruthy();
  }
});

test("a saved theme pick leaves a clean cache matching the server", async () => {
  layout.saveTheme.mockResolvedValueOnce({ theme: "dracula", layout: [], isDefault: true, updatedAt: "2026-10-24T12:00:00Z" });
  await applyThemeChoice("u1", "dracula");
  expect(document.documentElement.dataset.theme).toBe("dracula");
  expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ theme: "dracula", layout: [], updatedAt: "2026-10-24T12:00:00Z", themeDirty: false });
});

test("a failed theme save stays dirty for the dashboard to retry", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  layout.saveTheme.mockRejectedValueOnce(new Error("offline"));
  await applyThemeChoice("u1", "monokai");
  expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ theme: "monokai", themeDirty: true });
});

test("a newer pick is not overwritten by an older save finishing late", async () => {
  let finishFirst: (value: { theme: string; layout: unknown[]; isDefault: boolean; updatedAt: string | null }) => void = () => {};
  layout.saveTheme.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
  const first = applyThemeChoice("u1", "dracula");
  await applyThemeChoice("u1", "monokai");
  finishFirst({ theme: "dracula", layout: [], isDefault: true, updatedAt: "2026-10-24T12:00:00Z" });
  await first;
  expect(JSON.parse(localStorage.getItem(KEY)!).theme).toBe("monokai");
});

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
