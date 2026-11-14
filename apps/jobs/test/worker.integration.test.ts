import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { pool } from "@canvasplus/database";
import { enqueueJob, getJob } from "@canvasplus/database/queries/jobs";
import { runOnce, runWorker } from "../src/worker";
import type { JobHandler } from "../src/handlers";

// UC16: the worker process against a real queue -- one job end to end through the UC8
// scheduler, then every way a handler can go wrong.
const TYPE = "schedule.assignments";
const WORKER = { workerID: "test-worker" };
let userID: string, courseID: string;

beforeAll(async () => {
  userID = (await pool.query("INSERT INTO \"User\" (email, name) VALUES ($1, 'Worker test') RETURNING id", [`worker-${crypto.randomUUID()}@example.invalid`])).rows[0].id;
  courseID = (await pool.query("INSERT INTO \"Course\" (name, \"canvasBaseURL\", \"canvasCourseID\") VALUES ('Worker course', 'test://worker', $1) RETURNING id", [crypto.randomUUID()])).rows[0].id;
});
beforeEach(async () => {
  await pool.query('DELETE FROM "Job"');
  // The worker logs one JSON line per step; keep the test output readable but still inspectable.
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await pool.query('DELETE FROM "User" WHERE id = $1', [userID]);
  await pool.query('DELETE FROM "Course" WHERE id = $1', [courseID]);
  await pool.end();
});

const using = (handler: JobHandler) => ({ ...WORKER, handlers: { [TYPE]: handler } });
const trail = async (id: string) => (await getJob(userID, id)).events.map((e: { event: string }) => e.event);
const logged = (spy: "log" | "error") => vi.mocked(console[spy]).mock.calls.map(([line]) => JSON.parse(line as string));

test("an empty queue is a quiet no-op", async () => {
  expect(await runOnce(WORKER)).toBeNull();
});

test("a queued scheduling job is picked up, run through the UC8 scheduler, and its result stored", async () => {
  const windowStart = new Date(); windowStart.setDate(windowStart.getDate() + 1); windowStart.setHours(9, 0, 0, 0);
  const windowEnd = new Date(windowStart); windowEnd.setHours(21, 0, 0, 0);
  const assignmentID = (await pool.query("INSERT INTO \"Assignment\" (\"userID\", \"courseID\", title, points, \"dueAt\") VALUES ($1, $2, 'Essay', 20, $3) RETURNING id", [userID, courseID, windowEnd])).rows[0].id;
  await pool.query('INSERT INTO "AssignmentDetail" ("assignmentID", "estimatedMinutes") VALUES ($1, 90)', [assignmentID]);

  const queued = await enqueueJob(userID, TYPE, { windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString() });
  expect(await runOnce(WORKER)).toBe("completed");

  const job = await getJob(userID, queued.id);
  expect(job).toMatchObject({ status: "completed", attempts: 1, lastError: null });
  expect(job.result.scheduled).toHaveLength(1);
  expect(job.result.scheduled[0].assignmentID).toBe(assignmentID);
  expect(job.result.unscheduled).toEqual([]);
  expect(job.events.map((e: { event: string }) => e.event)).toEqual(["queued", "started", "log", "completed"]);
  expect(job.events[2].message).toBe("Scheduled 1, left 0 unscheduled");

  const blocks = await pool.query('SELECT calendar, "eventStart" FROM "CalendarEvent" WHERE "assignmentID" = $1', [assignmentID]);
  expect(blocks.rows).toHaveLength(1);
  expect(blocks.rows[0].calendar).toBe("smart-schedule");

  // The console log tells the same story, one traceable line per step.
  expect(logged("log").map(line => line.event)).toEqual(["job.started", "job.log", "job.completed"]);
  expect(logged("log").every(line => line.jobID === queued.id && line.workerID === "test-worker" && line.attempt === 1)).toBe(true);
});

test("a handler that throws is retried later, and the error is kept on the job", async () => {
  const { id } = await enqueueJob(userID, TYPE, {});
  expect(await runOnce(using(async () => { throw new Error("Canvas timed out"); }))).toBe("retry");

  const job = await getJob(userID, id);
  expect(job).toMatchObject({ status: "queued", attempts: 1, lastError: "Canvas timed out" });
  expect(new Date(job.runAt).getTime()).toBeGreaterThan(Date.now());
  expect(await runOnce(WORKER)).toBeNull(); // backing off, so nothing is due
  expect(logged("error")[0]).toMatchObject({ event: "job.retry", jobID: id, error: "Canvas timed out" });
});

test("the last allowed attempt failing marks the job failed", async () => {
  const { id } = await enqueueJob(userID, TYPE, {}, { maxAttempts: 1 });
  expect(await runOnce(using(async () => { throw new Error("boom"); }))).toBe("failed");
  expect(await getJob(userID, id)).toMatchObject({ status: "failed", lastError: "boom" });
  expect(await trail(id)).toEqual(["queued", "started", "failed"]);
});

test("a bad-input error (4xx) is not retried: a second run could not go differently", async () => {
  const { id } = await enqueueJob(userID, TYPE, {});
  const rejects: JobHandler = async () => { throw Object.assign(new Error("Assignment not found"), { status: 404 }); };
  expect(await runOnce(using(rejects))).toBe("failed");
  expect(await getJob(userID, id)).toMatchObject({ status: "failed", attempts: 1 });
});

test("a job type with no handler fails cleanly instead of crashing the worker", async () => {
  const { id } = (await pool.query("INSERT INTO \"Job\" (\"userID\", type) VALUES ($1, 'mystery.type') RETURNING id", [userID])).rows[0];
  expect(await runOnce(WORKER)).toBe("failed");
  expect(await getJob(userID, id)).toMatchObject({ status: "failed", lastError: 'No handler for job type "mystery.type"' });
});

test("a handler that hangs is timed out and retried", async () => {
  const { id } = await enqueueJob(userID, TYPE, {});
  expect(await runOnce({ ...using(() => new Promise(() => {})), timeoutMs: 50 })).toBe("retry");
  expect((await getJob(userID, id)).lastError).toMatch(/timed out/);
});

test("a worker that outlived its lease does not overwrite the worker that took over", async () => {
  const { id } = await enqueueJob(userID, TYPE, {});
  // While the slow handler is still running, its lease lapses and another worker finishes the job.
  const slow: JobHandler = async () => {
    await pool.query("UPDATE \"Job\" SET \"lockedUntil\" = NOW() - INTERVAL '1 second' WHERE id = $1", [id]);
    expect(await runOnce({ workerID: "rescuer", handlers: { [TYPE]: async () => ({ by: "rescuer" }) } })).toBe("completed");
    return { by: "slow" };
  };
  expect(await runOnce(using(slow))).toBe("lost");
  expect(await getJob(userID, id)).toMatchObject({ status: "completed", attempts: 2, result: { by: "rescuer" } });
});

test("the loop drains the queue, lets a handler log to the trail, and stops when told to", async () => {
  const seen: string[] = [];
  const handler: JobHandler = async (job, { log }) => { seen.push(job.id); await log("working"); return { ok: true }; };
  const jobs = await Promise.all([1, 2, 3].map(hour => enqueueJob(userID, TYPE, { dailyStartHour: hour })));

  const stop = new AbortController();
  const running = runWorker({ ...using(handler), pollMs: 20, signal: stop.signal });
  await vi.waitFor(() => expect(seen).toHaveLength(3), { timeout: 5000 });
  stop.abort();
  await running; // resolves: the loop exits instead of polling forever

  for (const job of jobs) expect(await trail(job.id)).toEqual(["queued", "started", "log", "completed"]);
  expect(logged("log").map(line => line.event)).toEqual(expect.arrayContaining(["worker.started", "worker.stopped"]));
});
