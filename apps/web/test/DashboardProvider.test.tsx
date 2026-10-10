import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import DashboardProvider, { useDashboard } from "../app/(dashboard)/_components/DashboardProvider";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), logout: vi.fn() }));
const layout = vi.hoisted(() => ({
  fetchLayout: vi.fn(async () => ({ theme: "light-modern", layout: [] as unknown[], isDefault: true, updatedAt: null as string | null })),
  saveTheme: vi.fn(async (theme: string) => ({ theme, layout: [] as unknown[], isDefault: true, updatedAt: "2026-10-10T12:00:00Z" }))
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks, usePathname: () => "/assignments" }));
vi.mock("@/lib/apiClient", async importOriginal => ({ ...await importOriginal<object>(), logout: mocks.logout }));
vi.mock("@/lib/assignmentsApi", () => ({ fetchAssignments: async () => [] }));
vi.mock("@/app/(dashboard)/assignments/_api/layoutApi", () => layout);
vi.mock("@/components/AssignmentDetails", () => ({ default: () => null }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

const KEY = "canvasplus:preferences:u1";
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? "null");
const theme = () => document.documentElement.dataset.theme;
const store = (value: object) => localStorage.setItem(KEY, JSON.stringify({ layout: [], updatedAt: null, themeDirty: false, ...value }));

function PickDracula() {
  const { changeTheme } = useDashboard();
  return <button type="button" onClick={() => changeTheme("dracula")}>Use Dracula</button>;
}

test("failed logout stays signed in and offers a retry", async () => {
  mocks.logout.mockRejectedValueOnce(new Error("Network unavailable"));
  render(<DashboardProvider initialName="Test" userId="u1">Private content</DashboardProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Log Out" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not sign out. Please try again.");
  expect(mocks.replace).not.toHaveBeenCalled();
  mocks.logout.mockResolvedValueOnce(undefined);
  fireEvent.click(screen.getByRole("button", { name: "Log Out" }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
});

test("an expired API session returns to sign-in and forgets this browser's copy", async () => {
  store({ theme: "dracula" });
  render(<DashboardProvider initialName="Test" userId="u1">Private content</DashboardProvider>);
  fireEvent(window, new Event("session-expired"));
  expect(mocks.replace).toHaveBeenCalledWith("/login");
  expect(localStorage.getItem(KEY)).toBeNull();
});

test("this browser's copy paints first, then a newer server row replaces it", async () => {
  store({ theme: "dracula", updatedAt: "2026-10-01T00:00:00Z" });
  let respond!: (value: Awaited<ReturnType<typeof layout.fetchLayout>>) => void;
  layout.fetchLayout.mockReturnValueOnce(new Promise(resolve => { respond = resolve; }));
  render(<DashboardProvider initialName="Test" userId="u1">Private content</DashboardProvider>);
  expect(theme()).toBe("dracula"); // before the server has answered

  await act(async () => respond({ theme: "monokai", layout: [], isDefault: false, updatedAt: "2026-10-10T00:00:00Z" }));
  expect(theme()).toBe("monokai");
  expect(stored()).toMatchObject({ theme: "monokai", updatedAt: "2026-10-10T00:00:00Z", themeDirty: false });
});

test("a theme whose save failed stays picked and is pushed on the next sync", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<DashboardProvider initialName="Test" userId="u1"><PickDracula /></DashboardProvider>);
  await waitFor(() => expect(layout.fetchLayout).toHaveBeenCalledTimes(1));

  layout.saveTheme.mockRejectedValueOnce(new Error("offline"));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use Dracula" })));
  expect(theme()).toBe("dracula");
  expect(stored()).toMatchObject({ theme: "dracula", themeDirty: true });

  // Back online: focusing the window pushes the pick instead of pulling the old server theme.
  await act(async () => fireEvent.focus(window));
  expect(layout.saveTheme).toHaveBeenLastCalledWith("dracula");
  expect(layout.fetchLayout).toHaveBeenCalledTimes(1);
  expect(stored()).toMatchObject({ theme: "dracula", themeDirty: false, updatedAt: "2026-10-10T12:00:00Z" });
  expect(theme()).toBe("dracula");
});

test("a change made in another tab applies without a request", async () => {
  render(<DashboardProvider initialName="Test" userId="u1">Private content</DashboardProvider>);
  await waitFor(() => expect(layout.fetchLayout).toHaveBeenCalledTimes(1));
  act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: JSON.stringify({ theme: "solarized-light", layout: [], updatedAt: null, themeDirty: false }) }));
  });
  expect(theme()).toBe("solarized-light");
  expect(layout.fetchLayout).toHaveBeenCalledTimes(1);
});
