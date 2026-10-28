import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useSyncExternalStore } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Walkthrough from "../app/(dashboard)/_components/walkthrough/Walkthrough";
import { WALKTHROUGH_STEPS, activeSteps } from "../app/(dashboard)/_components/walkthrough/walkthroughSteps";

// A tiny router: push() changes the pathname and re-renders anything reading it.
const nav = vi.hoisted(() => {
  let path = "/assignments";
  const subs = new Set<() => void>();
  return {
    get: () => path,
    set: (p: string) => { path = p; subs.forEach((f) => f()); },
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
    push: vi.fn((p: string) => { path = p; subs.forEach((f) => f()); })
  };
});
vi.mock("next/navigation", async () => {
  const React = await import("react");
  return {
    useRouter: () => ({ push: nav.push, replace: nav.push, refresh: vi.fn() }),
    usePathname: () => React.useSyncExternalStore(nav.subscribe, nav.get)
  };
});
const api = vi.hoisted(() => ({ saveOnboardingStep: vi.fn(async (_step: string, _status: string) => ({})) }));
vi.mock("@/lib/onboardingApi", () => api);
const dash = vi.hoisted(() => ({ assignments: [{ id: "a1" }] as unknown[], themeId: "light-modern", changeTheme: vi.fn(), darkMode: false }));
vi.mock("@/app/(dashboard)/_components/DashboardProvider", () => ({ useDashboard: () => dash }));

/** Fake pages that render the same markers the real ones carry. */
function FakeApp({ omit = [] as string[] }) {
  const path = useSyncExternalStore(nav.subscribe, nav.get);
  const marker = (id: string) => (omit.includes(id) ? null : <div key={id} data-tour={id}>{id}</div>);
  return (
    <div>
      {path === "/assignments" && [marker("home-grid"), marker("customize"), marker("assignment-card")]}
      {path === "/focus" && marker("focus-picker")}
      {path === "/analytics" && marker("analytics-range")}
      {path === "/calendar" && marker("calendar-view")}
      {path === "/settings" && marker("settings-accounts")}
    </div>
  );
}

const onEnd = vi.fn();
const start = (omit: string[] = []) => render(<><FakeApp omit={omit} /><Walkthrough onEnd={onEnd} markerTimeoutMs={300} /></>);
const title = (name: string) => screen.findByRole("heading", { name });
/** Click Next once the current stop is ready (Next is disabled while it finds its feature). */
const next = async () => {
  const button = screen.getByRole("button", { name: "Next" }) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
};

beforeEach(() => {
  nav.set("/assignments");
  dash.assignments = [{ id: "a1" }];
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // @ts-expect-error test cleanup of an optional browser API
  delete window.matchMedia;
});

test("every stop has a page, a title and text, and the last is the theme picker", () => {
  expect(WALKTHROUGH_STEPS.map((s) => s.id)).toEqual(["home", "customize", "assignments", "timer", "analytics", "calendar", "settings", "theme"]);
  for (const step of WALKTHROUGH_STEPS) {
    expect(step.path).toMatch(/^\//);
    expect(step.title).toBeTruthy();
    expect(step.text).toBeTruthy();
  }
  expect(WALKTHROUGH_STEPS.at(-1)!.marker).toBeNull();
});

test("skip rules drop Customize on narrow screens and the assignment stop with no assignments", () => {
  expect(activeSteps({ wide: true, assignmentCount: 3 })).toHaveLength(8);
  expect(activeSteps({ wide: false, assignmentCount: 3 }).map((s) => s.id)).not.toContain("customize");
  expect(activeSteps({ wide: true, assignmentCount: 0 }).map((s) => s.id)).not.toContain("assignments");
});

test("walks every stop in order across pages and Done records the tour", async () => {
  start();
  await title("Your dashboard");
  expect(screen.getByText("Stop 1 of 8")).toBeTruthy();
  expect(screen.getByTestId("walkthrough-spotlight")).toBeTruthy();
  for (const [name, path] of [["Customize", null], ["Your assignments", null], ["Study timer", "/focus"], ["Study analytics", "/analytics"], ["Calendar", "/calendar"], ["Accounts and setup", "/settings"], ["Pick a theme", "/assignments"]] as const) {
    await next();
    await title(name);
    if (path) expect(nav.push).toHaveBeenLastCalledWith(path);
  }
  expect(screen.getByText("Stop 8 of 8")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await waitFor(() => expect(onEnd).toHaveBeenCalled());
  expect(api.saveOnboardingStep).toHaveBeenCalledTimes(1);
  expect(api.saveOnboardingStep).toHaveBeenCalledWith("tour", "done");
});

test("Back returns to the previous stop", async () => {
  start();
  await title("Your dashboard");
  await next();
  await title("Customize");
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  await title("Your dashboard");
});

test("Esc ends the tour as skipped", async () => {
  start();
  await title("Your dashboard");
  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() => expect(onEnd).toHaveBeenCalled());
  expect(api.saveOnboardingStep).toHaveBeenCalledWith("tour", "skipped");
});

test("Skip tour saves once even when clicked twice", async () => {
  start();
  await title("Your dashboard");
  const skip = screen.getByRole("button", { name: "Skip tour" });
  fireEvent.click(skip);
  fireEvent.click(skip);
  await waitFor(() => expect(onEnd).toHaveBeenCalled());
  expect(api.saveOnboardingStep).toHaveBeenCalledTimes(1);
});

test("a feature that never appears is skipped after the timeout", async () => {
  start(["focus-picker"]);
  await title("Your dashboard");
  await next(); await title("Customize");
  await next(); await title("Your assignments");
  await next();
  expect(await screen.findByText("Loading…")).toBeTruthy();
  await title("Study analytics");
});

test("with no assignments the assignment stop is skipped and not counted", async () => {
  dash.assignments = [];
  start();
  await title("Your dashboard");
  expect(screen.getByText("Stop 1 of 7")).toBeTruthy();
  await next(); await title("Customize");
  await next(); await title("Study timer");
});

test("narrow screens skip the Customize stop", async () => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  start();
  await title("Your dashboard");
  await next();
  await title("Your assignments");
});

test("picking a theme on the last stop uses the dashboard's theme switch", async () => {
  start();
  await title("Your dashboard");
  for (const name of ["Customize", "Your assignments", "Study timer", "Study analytics", "Calendar", "Accounts and setup", "Pick a theme"]) {
    await next();
    await title(name);
  }
  fireEvent.click(screen.getByRole("radio", { name: "Dracula" }));
  expect(dash.changeTheme).toHaveBeenCalledWith("dracula");
});

test("focus moves into the walkthrough dialog", async () => {
  start();
  await title("Your dashboard");
  const dialog = screen.getByRole("dialog");
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
});

test("leaving the page some other way ends the tour as skipped", async () => {
  start();
  await title("Your dashboard");
  act(() => nav.set("/calendar"));
  await waitFor(() => expect(onEnd).toHaveBeenCalled());
  expect(api.saveOnboardingStep).toHaveBeenCalledWith("tour", "skipped");
});
