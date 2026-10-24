import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import OnboardingWizard from "../app/(onboarding)/onboarding/_components/OnboardingWizard";
import type { OnboardingState } from "@/lib/onboarding";

const api = vi.hoisted(() => ({
  saveOnboardingStep: vi.fn(async (step: string, status: string) => ({ steps: { [step]: status }, completedAt: null, nextStep: null })),
  completeOnboarding: vi.fn(async () => ({ steps: {}, completedAt: "2026-10-24T12:00:00Z", nextStep: null })),
  restartOnboarding: vi.fn(),
  fetchOnboarding: vi.fn()
}));
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/onboardingApi", () => api);
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

const state = (steps: OnboardingState["steps"], nextStep: OnboardingState["nextStep"]): OnboardingState => ({ steps, completedAt: null, nextStep });
const wizard = (initial: OnboardingState, googleResult: "connected" | "error" | null = null) =>
  render(<OnboardingWizard userId="u1" initialState={initial} googleResult={googleResult} />);

test("resumes at the first unfinished step", () => {
  wizard(state({ canvas: "done", google: "skipped" }, "sync"));
  expect(screen.getByRole("heading", { name: "Run your first sync" })).toBeTruthy();
  expect(screen.getByText("Step 3 of 4")).toBeTruthy();
});

test("a failed save keeps the user on the step", async () => {
  api.saveOnboardingStep.mockRejectedValueOnce(new Error("offline"));
  wizard(state({}, "canvas"));
  fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Could not save your progress. Try again.");
  expect(screen.getByRole("heading", { name: "Connect Canvas" })).toBeTruthy();
});

test("a successful save moves to the next step", async () => {
  wizard(state({}, "canvas"));
  fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Google Calendar" })).toBeTruthy());
  expect(api.saveOnboardingStep).toHaveBeenCalledWith("canvas", "done");
  expect(screen.getByText("Step 2 of 4")).toBeTruthy();
});

test("Back returns to the previous step without saving", () => {
  wizard(state({ canvas: "done" }, "google"));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("heading", { name: "Connect Canvas" })).toBeTruthy();
  expect(api.saveOnboardingStep).not.toHaveBeenCalled();
});

test("the first step has no Back button", () => {
  wizard(state({}, "canvas"));
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
});
