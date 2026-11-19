// UC20 reward settings: the form only offers a requirement the chosen trigger can
// satisfy, and retiring hides a reward without losing it.
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import RewardSettings from "../app/(dashboard)/settings/_components/RewardSettings";
import { describeTrigger } from "../lib/rewardsApi";

const reward = (extra: Record<string, unknown> = {}) => ({
  id: "r1", name: "Boba run", description: null, rarityPercent: 25,
  trigger: "any", minStudyMinutes: null, requireOnTime: false, active: true,
  createdAt: "2026-11-19T00:00:00Z", updatedAt: "2026-11-19T00:00:00Z", ...extra
});

const api = vi.hoisted(() => ({
  fetchRewards: vi.fn(),
  createReward: vi.fn(),
  updateReward: vi.fn(),
  retireReward: vi.fn(),
  restoreReward: vi.fn()
}));
vi.mock("@/lib/rewardsApi", async () => {
  const actual = await vi.importActual<typeof import("../lib/rewardsApi")>("../lib/rewardsApi");
  return { ...actual, ...api };
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

test("lists the student's rewards with their chance and when they are rolled", async () => {
  api.fetchRewards.mockResolvedValue([reward({ trigger: "study_session", minStudyMinutes: 45 })]);
  render(<RewardSettings darkMode={false} />);
  expect(await screen.findByText("Boba run")).toBeTruthy();
  expect(screen.getByText(/25% · Rare/)).toBeTruthy();
  expect(screen.getByText("After a study session of 45 minutes or more")).toBeTruthy();
});

test("adding a reward sends the trigger and clears the form", async () => {
  api.fetchRewards.mockResolvedValue([]);
  api.createReward.mockResolvedValue(reward());
  render(<RewardSettings darkMode={false} />);
  await screen.findByText(/No rewards yet/);

  fireEvent.change(screen.getByLabelText("Reward"), { target: { value: "Movie night" } });
  fireEvent.change(screen.getByLabelText("Chance (%)"), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText("Roll it after"), { target: { value: "study_session" } });
  fireEvent.change(screen.getByLabelText(/study session of at least/), { target: { value: "60" } });
  fireEvent.click(screen.getByRole("button", { name: /Add reward/ }));

  await waitFor(() => expect(api.createReward).toHaveBeenCalledWith({
    name: "Movie night", rarityPercent: 10, description: null,
    trigger: "study_session", minStudyMinutes: 60, requireOnTime: false
  }));
  await waitFor(() => expect((screen.getByLabelText("Reward") as HTMLInputElement).value).toBe(""));
});

test("the form only offers the requirement the chosen trigger can satisfy", async () => {
  api.fetchRewards.mockResolvedValue([]);
  render(<RewardSettings darkMode={false} />);
  await screen.findByText(/No rewards yet/);

  // "any" can satisfy both.
  expect(screen.queryByLabelText(/study session of at least/)).toBeTruthy();
  expect(screen.queryByLabelText(/finished on time/)).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Roll it after"), { target: { value: "assignment" } });
  expect(screen.queryByLabelText(/study session of at least/)).toBeNull();
  expect(screen.queryByLabelText(/finished on time/)).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Roll it after"), { target: { value: "study_session" } });
  expect(screen.queryByLabelText(/study session of at least/)).toBeTruthy();
  expect(screen.queryByLabelText(/finished on time/)).toBeNull();
});

test("switching a saved reward to assignment rolls clears the study length the API would refuse", async () => {
  api.fetchRewards.mockResolvedValue([reward({ trigger: "study_session", minStudyMinutes: 45 })]);
  api.updateReward.mockResolvedValue(reward({ trigger: "assignment" }));
  render(<RewardSettings darkMode={false} />);

  fireEvent.change(await screen.findByLabelText("When to roll Boba run"), { target: { value: "assignment" } });
  await waitFor(() => expect(api.updateReward).toHaveBeenCalledWith("r1", {
    trigger: "assignment", minStudyMinutes: null, requireOnTime: false
  }));
});

test("retiring a reward reloads the list, and a failure is shown without losing the row", async () => {
  api.fetchRewards.mockResolvedValue([reward()]);
  api.retireReward.mockRejectedValueOnce(new Error("Reward not found"));
  render(<RewardSettings darkMode={false} />);

  fireEvent.click(await screen.findByRole("button", { name: "Retire Boba run" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Reward not found");
  expect(screen.getByText("Boba run")).toBeTruthy();
});

test("a retired reward can be brought back", async () => {
  api.fetchRewards.mockResolvedValue([reward({ active: false })]);
  api.restoreReward.mockResolvedValue(reward());
  render(<RewardSettings darkMode={false} />);

  fireEvent.click(await screen.findByRole("button", { name: "Restore Boba run" }));
  await waitFor(() => expect(api.restoreReward).toHaveBeenCalledWith("r1"));
});

test("describeTrigger reads each combination as a sentence", () => {
  expect(describeTrigger({ trigger: "any", minStudyMinutes: null, requireOnTime: false }))
    .toBe("After any assignment or study session");
  expect(describeTrigger({ trigger: "assignment", minStudyMinutes: null, requireOnTime: true }))
    .toBe("After an assignment finished on time");
  expect(describeTrigger({ trigger: "study_session", minStudyMinutes: null, requireOnTime: false }))
    .toBe("After any study session");
});
