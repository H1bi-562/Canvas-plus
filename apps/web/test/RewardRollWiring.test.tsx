import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import AssignmentDetails from "@/components/AssignmentDetails";
import type { Assignment } from "@/lib/assignmentsApi";
import { REWARD_ROLL_EVENT, type RollRequest } from "@/lib/rewardsApi";

// UC20: marking an assignment done is what earns a roll. Un-marking it must not.
const request = vi.hoisted(() => ({ apiRequest: vi.fn(async () => ({})) }));
vi.mock("@/lib/apiClient", () => ({ ...request, ApiError: class ApiError extends Error {} }));
// Panels inside the details view with requests of their own; not what this file is about.
vi.mock("@/components/EstimateEditor", () => ({ default: () => null }));
vi.mock("@/components/GradeImpact", () => ({ default: () => null }));

const asked: RollRequest[] = [];
const listener = (event: Event) => asked.push((event as CustomEvent<RollRequest>).detail);
beforeEach(() => window.addEventListener(REWARD_ROLL_EVENT, listener));
afterEach(() => { cleanup(); window.removeEventListener(REWARD_ROLL_EVENT, listener); asked.length = 0; vi.clearAllMocks(); });

const assignment = (extra: Partial<Assignment>) => ({
  id: "a1", title: "Essay 2", courseID: "c1", points: 10, score: null, groupID: null, description: "",
  completionStatus: "pending", completedAt: null, submittedAt: null, estimatedMinutes: 60, loggedMinutes: 0,
  priority: "Medium", dueLabel: "Tomorrow", ...extra
}) as Assignment;

function open(a: Assignment) {
  const onChanged = vi.fn();
  render(<AssignmentDetails assignment={a} assignments={[a]} darkMode={false} onClose={() => {}} getPriorityColor={() => ""} onChanged={onChanged} />);
  return onChanged;
}

test("Mark done saves the completion, then asks for a reward roll for that assignment", async () => {
  const onChanged = open(assignment({}));
  fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(request.apiRequest).toHaveBeenCalledWith("/api/assignments/a1/completion", "PATCH", { completed: true });
  expect(asked).toEqual([{ trigger: "assignment", sourceID: "a1", label: "Essay 2" }]);
});

test("Mark not done asks for nothing", async () => {
  const onChanged = open(assignment({ completionStatus: "done", completedAt: "2026-11-14T18:00:00Z" }));
  fireEvent.click(screen.getByRole("button", { name: "Mark not done" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(asked).toEqual([]);
});

test("a completion that fails to save earns no roll", async () => {
  request.apiRequest.mockRejectedValueOnce(new Error("offline"));
  open(assignment({}));
  fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Could not update this assignment.");
  expect(asked).toEqual([]);
});
