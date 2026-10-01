import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import DashboardProvider from "../app/(dashboard)/_components/DashboardProvider";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), logout: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks, usePathname: () => "/assignments" }));
vi.mock("@/lib/apiClient", async importOriginal => ({ ...await importOriginal<object>(), logout: mocks.logout }));
vi.mock("@/lib/assignmentsApi", () => ({ fetchAssignments: async () => [] }));
vi.mock("@/app/(dashboard)/assignments/_api/layoutApi", () => ({ fetchLayout: async () => ({ theme: "light-modern" }), saveTheme: async () => ({}) }));
vi.mock("@/components/AssignmentDetails", () => ({ default: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test("failed logout stays signed in and offers a retry", async () => {
  mocks.logout.mockRejectedValueOnce(new Error("Network unavailable"));
  render(<DashboardProvider initialName="Test">Private content</DashboardProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Log Out" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not sign out. Please try again.");
  expect(mocks.replace).not.toHaveBeenCalled();
  mocks.logout.mockResolvedValueOnce(undefined);
  fireEvent.click(screen.getByRole("button", { name: "Log Out" }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
});

test("an expired API session returns to sign-in", async () => {
  render(<DashboardProvider initialName="Test">Private content</DashboardProvider>);
  fireEvent(window, new Event("session-expired"));
  expect(mocks.replace).toHaveBeenCalledWith("/login");
});
