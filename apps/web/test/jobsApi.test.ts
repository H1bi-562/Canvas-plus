import { afterEach, expect, test, vi } from "vitest";
import { fetchJobs, submitJob, waitForJob } from "@/lib/jobsApi";

const request = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/apiClient", () => ({ ...request, ApiError: class ApiError extends Error { constructor(message: string, public status: number) { super(message); } } }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

const job = (status: string, extra = {}) => ({ id: "j1", status, events: [], ...extra });

test("submit and list hit the queue endpoints", async () => {
  request.apiRequest.mockResolvedValue({});
  await submitJob("schedule.assignments", { dailyStartHour: 8 });
  await fetchJobs("failed");
  expect(request.apiRequest.mock.calls).toEqual([
    ["/api/jobs", "POST", { type: "schedule.assignments", payload: { dailyStartHour: 8 } }],
    ["/api/jobs?status=failed"]
  ]);
});

test("waitForJob polls until the job finishes and reports each update", async () => {
  vi.useFakeTimers();
  request.apiRequest.mockResolvedValueOnce(job("queued")).mockResolvedValueOnce(job("running")).mockResolvedValueOnce(job("completed", { result: { scheduled: 2 } }));
  const updates: string[] = [];
  const waiting = waitForJob("j1", { intervalMs: 500, onUpdate: (j) => updates.push(j.status) });
  await vi.advanceTimersByTimeAsync(1000);
  expect(await waiting).toMatchObject({ status: "completed", result: { scheduled: 2 } });
  expect(updates).toEqual(["queued", "running", "completed"]);
  expect(request.apiRequest).toHaveBeenCalledTimes(3);
});

test("a failed job resolves too: it is an outcome to show, not a thrown error", async () => {
  request.apiRequest.mockResolvedValueOnce(job("failed", { lastError: "Canvas timed out" }));
  expect(await waitForJob("j1")).toMatchObject({ status: "failed", lastError: "Canvas timed out" });
});

test("waitForJob gives up after the timeout instead of polling forever", async () => {
  vi.useFakeTimers();
  request.apiRequest.mockResolvedValue(job("running"));
  const waiting = waitForJob("j1", { intervalMs: 500, timeoutMs: 1200 });
  const failure = expect(waiting).rejects.toThrow(/longer than expected/);
  await vi.advanceTimersByTimeAsync(2000);
  await failure;
  expect(request.apiRequest.mock.calls.length).toBeLessThanOrEqual(3);
});
