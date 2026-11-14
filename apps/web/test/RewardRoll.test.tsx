import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import RewardRollModal, { ROLL_MS } from "@/components/RewardRollModal";
import RewardRollHost from "@/components/RewardRollHost";
import { REWARD_ROLL_EVENT, rarityTier, requestRewardRoll, type RewardRoll, type RollRequest } from "@/lib/rewardsApi";

// The roll endpoint is the server's business; here it is only ever a mocked request.
const request = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/apiClient", () => request);

afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

const roll = (extra: Partial<RewardRoll> = {}): RewardRoll => ({
  id: crypto.randomUUID(), trigger: "assignment", rewardID: "r1", rewardName: "Boba run",
  rewardDescription: "Large, extra pearls", rarityPercent: 12, rolledAt: "2026-11-14T18:00:00Z", claimedAt: null, ...extra
});
const empty = () => roll({ rewardID: null, rewardName: null, rewardDescription: null, rarityPercent: null });

test("rarity tiers get rarer as the drop chance falls", () => {
  expect([100, 61, 60, 36, 35, 16, 15, 6, 5, 0.5].map(rarityTier)).toEqual(
    ["Common", "Common", "Uncommon", "Uncommon", "Rare", "Rare", "Epic", "Epic", "Legendary", "Legendary"]);
});

test("the dice spin first, then the won reward is revealed with its rarity", () => {
  vi.useFakeTimers();
  render(<RewardRollModal darkMode={false} roll={roll()} label="Essay 2" onClose={() => {}} />);
  expect(screen.getByRole("dialog", { name: "Rolling for a reward…" })).toBeTruthy();
  expect(screen.getByText("Finished: Essay 2")).toBeTruthy();
  expect(screen.queryByText("Boba run")).toBeNull(); // no spoilers while it spins

  act(() => { vi.advanceTimersByTime(ROLL_MS); });
  expect(screen.getByRole("dialog", { name: "You won a reward!" })).toBeTruthy();
  expect(screen.getByText("Boba run")).toBeTruthy();
  expect(screen.getByText("Large, extra pearls")).toBeTruthy();
  expect(screen.getByText("Epic · 12% chance")).toBeTruthy();
});

test("Skip reveals straight away, and the same button then closes", () => {
  const onClose = vi.fn();
  render(<RewardRollModal darkMode roll={roll()} onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  expect(screen.getByText("Boba run")).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Nice!" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("an empty roll says so instead of showing a reward", () => {
  render(<RewardRollModal darkMode={false} roll={empty()} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  expect(screen.getByRole("dialog", { name: "No reward this time" })).toBeTruthy();
  expect(screen.getByText(/Better luck on the next one/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
});

test("students who turned animations off get the result with no spin", () => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
  try {
    render(<RewardRollModal darkMode={false} roll={roll()} onClose={() => {}} />);
    expect(screen.getByText("Boba run")).toBeTruthy();
  } finally {
    vi.unstubAllGlobals();
  }
});

test("the dialog takes focus, closes on Esc or a backdrop click, and gives focus back", () => {
  const onClose = vi.fn();
  const opener = document.body.appendChild(document.createElement("button"));
  opener.focus();
  const { unmount } = render(<RewardRollModal darkMode={false} roll={roll()} onClose={onClose} />);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Skip" }));

  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(screen.getByRole("dialog").parentElement!); // the backdrop
  fireEvent.click(screen.getByRole("dialog"));                // inside the card: not a close
  expect(onClose).toHaveBeenCalledTimes(2);

  unmount();
  expect(document.activeElement).toBe(opener);
  opener.remove();
});

test("requestRewardRoll fires the event the host listens for", () => {
  const seen: RollRequest[] = [];
  const listener = (event: Event) => seen.push((event as CustomEvent<RollRequest>).detail);
  window.addEventListener(REWARD_ROLL_EVENT, listener);
  requestRewardRoll({ trigger: "study_session", sourceID: "s1", label: "Study session" });
  window.removeEventListener(REWARD_ROLL_EVENT, listener);
  expect(seen).toEqual([{ trigger: "study_session", sourceID: "s1", label: "Study session" }]);
});

test("the host rolls on the server when asked and shows the result", async () => {
  request.apiRequest.mockResolvedValueOnce({ roll: roll() });
  render(<RewardRollHost darkMode={false} />);
  expect(screen.queryByRole("dialog")).toBeNull();

  act(() => requestRewardRoll({ trigger: "assignment", sourceID: "a1", label: "Essay 2" }));
  expect(await screen.findByRole("dialog")).toBeTruthy();
  expect(request.apiRequest).toHaveBeenCalledWith("/api/rewards/roll", "POST", { trigger: "assignment", sourceID: "a1" });
  expect(screen.getByText("Finished: Essay 2")).toBeTruthy();
});

test("the host stays out of the way when there is nothing to show", async () => {
  request.apiRequest
    .mockResolvedValueOnce({ roll: null })                       // no eligible reward
    .mockRejectedValueOnce(new Error("Request failed (409)"))    // already rolled for
    .mockRejectedValueOnce(new Error("Request failed (404)"));   // roll endpoint not deployed
  render(<RewardRollHost darkMode={false} />);
  for (const sourceID of ["a1", "a2", "a3"]) act(() => requestRewardRoll({ trigger: "assignment", sourceID }));
  await waitFor(() => expect(request.apiRequest).toHaveBeenCalledTimes(3));
  await act(async () => {});
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("two rolls in a row are shown one after the other", async () => {
  request.apiRequest
    .mockResolvedValueOnce({ roll: roll({ rewardName: "Boba run" }) })
    .mockResolvedValueOnce({ roll: roll({ trigger: "study_session", rewardName: "Movie night" }) });
  render(<RewardRollHost darkMode={false} />);
  act(() => requestRewardRoll({ trigger: "assignment", sourceID: "a1" }));
  act(() => requestRewardRoll({ trigger: "study_session", sourceID: "s1" }));

  fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
  expect(screen.getByText("Boba run")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Nice!" }));

  fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
  expect(screen.getByText("Movie night")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Nice!" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
