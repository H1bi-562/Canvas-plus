import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SetupCard from "../app/(dashboard)/settings/_components/SetupCard";

const api = vi.hoisted(() => ({ restartOnboarding: vi.fn(async () => ({ steps: {}, completedAt: null, nextStep: "canvas" })) }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/onboardingApi", () => api);
vi.mock("next/navigation", () => ({ useRouter: () => router }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test("restarts setup and opens the wizard", async () => {
  render(<SetupCard darkMode={false} />);
  expect(screen.getByRole("heading", { name: "Setup" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Run setup again" }));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith("/onboarding"));
  expect(api.restartOnboarding).toHaveBeenCalled();
});

test("a failed restart stays on Settings and shows an error", async () => {
  api.restartOnboarding.mockRejectedValueOnce(new Error("offline"));
  render(<SetupCard darkMode={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Run setup again" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Could not restart setup. Try again.");
  expect(router.push).not.toHaveBeenCalled();
});
