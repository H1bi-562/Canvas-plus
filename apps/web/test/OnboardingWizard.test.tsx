import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import OnboardingWizard from "../app/(onboarding)/onboarding/_components/OnboardingWizard";
import type { OnboardingState } from "@/lib/onboarding";
import { ApiError } from "@/lib/apiClient";

const api = vi.hoisted(() => ({
  saveOnboardingStep: vi.fn(async (step: string, status: string) => ({ steps: { [step]: status }, completedAt: null, nextStep: null })),
  completeOnboarding: vi.fn(async () => ({ steps: {}, completedAt: "2026-10-24T12:00:00Z", nextStep: null })),
  restartOnboarding: vi.fn(),
  fetchOnboarding: vi.fn()
}));
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
const canvas = vi.hoisted(() => ({
  fetchCanvasStatus: vi.fn(async () => ({ connected: true, configured: false, canvasName: "Test" } as { connected: boolean; configured: boolean; canvasName?: string })),
  connectWithToken: vi.fn(async (_token: string) => ({ connected: true, configured: false, canvasName: "Test" })),
  syncAssignments: vi.fn()
}));
const google = vi.hoisted(() => ({
  fetchGoogleStatus: vi.fn(async () => ({ configured: true, connected: false })),
  connectGoogle: vi.fn(async (_returnTo?: object) => {}),
  fetchHiddenSources: vi.fn(async () => [] as string[]),
  saveHiddenSources: vi.fn(async (_hidden: string[]) => ({}))
}));
vi.mock("@/lib/onboardingApi", () => api);
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/(dashboard)/settings/_api/canvasApi", () => canvas);
vi.mock("@/lib/googleCalendarApi", () => google);
const layout = vi.hoisted(() => ({
  saveTheme: vi.fn(async (theme: string) => ({ theme, layout: [] as unknown[], isDefault: true, updatedAt: "2026-10-24T12:00:00Z" })),
  fetchLayout: vi.fn()
}));
vi.mock("@/app/(dashboard)/assignments/_api/layoutApi", () => layout);

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

// ── Canvas step ──────────────────────────────────────────────────────────
test("Canvas can be skipped", async () => {
  canvas.fetchCanvasStatus.mockResolvedValueOnce({ connected: false, configured: false });
  wizard(state({}, "canvas"));
  fireEvent.click(await screen.findByRole("button", { name: "I'll connect later" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Google Calendar" })).toBeTruthy());
  expect(api.saveOnboardingStep).toHaveBeenCalledWith("canvas", "skipped");
});

test("a pasted token connects and records the Canvas step", async () => {
  canvas.fetchCanvasStatus.mockResolvedValueOnce({ connected: false, configured: false });
  wizard(state({}, "canvas"));
  fireEvent.change(await screen.findByLabelText("Canvas access token"), { target: { value: "fake-test-token" } });
  fireEvent.click(screen.getByRole("button", { name: "Connect Canvas" }));
  await waitFor(() => expect(api.saveOnboardingStep).toHaveBeenCalledWith("canvas", "done"));
  expect(canvas.connectWithToken).toHaveBeenCalledWith("fake-test-token");
});

test("an unconfigured Canvas server leaves only Skip", async () => {
  canvas.fetchCanvasStatus.mockResolvedValueOnce({ connected: false, configured: false });
  canvas.connectWithToken.mockRejectedValueOnce(new ApiError("Canvas is not configured. Missing: CANVAS_BASE_URL", 503));
  wizard(state({}, "canvas"));
  fireEvent.change(await screen.findByLabelText("Canvas access token"), { target: { value: "fake-test-token" } });
  fireEvent.click(screen.getByRole("button", { name: "Connect Canvas" }));
  expect(await screen.findByText("Canvas isn't set up on this server yet. You can skip this step and connect later in Settings.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Connect Canvas" })).toBeNull();
  expect(screen.getByRole("button", { name: "I'll connect later" })).toBeTruthy();
  expect(api.saveOnboardingStep).not.toHaveBeenCalled();
});

// ── Google step ──────────────────────────────────────────────────────────
test("a failed Google callback shows an error and records nothing", async () => {
  wizard(state({ canvas: "done" }, "google"), "error");
  expect((await screen.findByRole("alert")).textContent).toBe("Google didn't connect. You can try again or skip.");
  expect(api.saveOnboardingStep).not.toHaveBeenCalled();
});

test("Google can be skipped", async () => {
  wizard(state({ canvas: "done" }, "google"));
  fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
  await waitFor(() => expect(api.saveOnboardingStep).toHaveBeenCalledWith("google", "skipped"));
});

test("Connect Google returns to the wizard", async () => {
  wizard(state({ canvas: "done" }, "google"));
  fireEvent.click(await screen.findByRole("button", { name: "Connect Google" }));
  await waitFor(() => expect(google.connectGoogle).toHaveBeenCalledWith({ callbackURL: "/onboarding?google=connected", errorCallbackURL: "/onboarding?google=error" }));
});

test("a Google server without credentials can only be skipped", async () => {
  google.fetchGoogleStatus.mockResolvedValueOnce({ configured: false, connected: false });
  wizard(state({ canvas: "done" }, "google"));
  expect(await screen.findByText("Google sign-in isn't set up on this server.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Connect Google" })).toBeNull();
  expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
});

test("a connected Google account continues as done", async () => {
  google.fetchGoogleStatus.mockResolvedValueOnce({ configured: true, connected: true });
  wizard(state({ canvas: "done" }, "google"), "connected");
  expect(await screen.findByText("Google Calendar is connected")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(api.saveOnboardingStep).toHaveBeenCalledWith("google", "done"));
});

// ── First sync step ──────────────────────────────────────────────────────
test("the first sync reports what was imported", async () => {
  canvas.syncAssignments.mockResolvedValueOnce({ courses: 3, assignments: 12, created: 12, updated: 0, syncedAt: "2026-10-24T12:00:00Z" });
  wizard(state({ canvas: "done", google: "skipped" }, "sync"));
  fireEvent.click(await screen.findByRole("button", { name: "Run first sync" }));
  expect(await screen.findByText("Synced 12 assignments from 3 courses")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(api.saveOnboardingStep).toHaveBeenCalledWith("sync", "done"));
});

test("a rejected token offers a way back to the Canvas step", async () => {
  canvas.syncAssignments.mockRejectedValueOnce(new ApiError("Canvas no longer accepts the stored token. Reconnect your Canvas account.", 409));
  wizard(state({ canvas: "done", google: "skipped" }, "sync"));
  fireEvent.click(await screen.findByRole("button", { name: "Run first sync" }));
  expect(await screen.findByText("Canvas no longer accepts the stored token. Reconnect your Canvas account.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Back to Canvas" }));
  expect(screen.getByRole("heading", { name: "Connect Canvas" })).toBeTruthy();
  expect(api.saveOnboardingStep).not.toHaveBeenCalled();
});

test("without Canvas the step can be passed", async () => {
  canvas.fetchCanvasStatus.mockResolvedValueOnce({ connected: false, configured: false });
  wizard(state({ canvas: "skipped", google: "skipped" }, "sync"));
  expect(await screen.findByText("Connect Canvas first to sync your assignments.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(api.saveOnboardingStep).toHaveBeenCalledWith("sync", "skipped"));
});

test("moving on without syncing records the step as skipped", async () => {
  wizard(state({ canvas: "done", google: "skipped" }, "sync"));
  fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
  await waitFor(() => expect(api.saveOnboardingStep).toHaveBeenCalledWith("sync", "skipped"));
  expect(canvas.syncAssignments).not.toHaveBeenCalled();
});

test("turning off Canvas due dates saves the hidden list", async () => {
  wizard(state({ canvas: "done", google: "skipped" }, "sync"));
  const canvasSwitch = await screen.findByRole("switch", { name: "Show Canvas due dates" });
  expect(canvasSwitch.getAttribute("aria-checked")).toBe("true");
  fireEvent.click(canvasSwitch);
  await waitFor(() => expect(google.saveHiddenSources).toHaveBeenCalledWith(["canvas"]));
  expect(screen.queryByRole("switch", { name: "Show Google events" })).toBeNull();
});

test("the Google events switch appears once Google is connected", async () => {
  google.fetchGoogleStatus.mockResolvedValueOnce({ configured: true, connected: true });
  wizard(state({ canvas: "done", google: "done" }, "sync"));
  expect(await screen.findByRole("switch", { name: "Show Google events" })).toBeTruthy();
});

// ── Tour, theme and Finish ───────────────────────────────────────────────
const atTour = () => wizard(state({ canvas: "done", google: "skipped", sync: "done" }, "tour"));

test("the tour walks six cards and Skip tour jumps to the theme picker", () => {
  atTour();
  expect(screen.getByText("Card 1 of 6")).toBeTruthy();
  for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Card 6 of 6")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
  expect(screen.getByText("Card 5 of 6")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
  expect(screen.getByRole("heading", { name: "Pick a theme" })).toBeTruthy();
});

test("Next on the last card opens the theme picker", () => {
  atTour();
  for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("heading", { name: "Pick a theme" })).toBeTruthy();
});

test("picking a theme applies and saves it", async () => {
  atTour();
  fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
  fireEvent.click(screen.getByRole("radio", { name: "Dracula" }));
  await waitFor(() => expect(layout.saveTheme).toHaveBeenCalledWith("dracula"));
  expect(document.documentElement.dataset.theme).toBe("dracula");
  expect(screen.getByRole("radio", { name: "Dracula" }).getAttribute("aria-checked")).toBe("true");
});

test("Finish completes onboarding and opens the dashboard", async () => {
  atTour();
  fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/assignments"));
  expect(api.completeOnboarding).toHaveBeenCalled();
  expect(router.refresh).toHaveBeenCalled();
});

test("a failed Finish stays on the wizard with an error", async () => {
  api.completeOnboarding.mockRejectedValueOnce(new Error("offline"));
  atTour();
  fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Could not save your progress. Try again.");
  expect(router.replace).not.toHaveBeenCalled();
});
