import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { db, pool } from "../src/client";
import { user } from "../src/schema";
import { MAX_OPEN_JOBS_PER_USER, claimNextJob, completeJob, enqueueJob, failJob, getJob, listJobs, logJobEvent, publicJob, retryDelaySeconds } from "../src/queries/jobs.js";

// UC16: the queue's own guarantees -- validation, dedupe, one worker per job, retries,
// leases, and the event trail. apps/jobs tests the worker loop built on top of these.
const TYPE = "schedule.assignments";
let alice: string, bob: string;

beforeAll(async () => {
  const rows = await db.insert(user).values([
    { name: "Alice", email: `jobs-alice-${crypto.randomUUID()}@example.invalid` },
    { name: "Bob", email: `jobs-bob-${crypto.randomUUID()}@example.invalid` }
  ]).returning();
  [alice, bob] = rows.map(row => row.id);
});
// claimNextJob takes whatever is due, so every test starts from an empty queue.
beforeEach(() => pool.query('DELETE FROM "Job"'));
afterAll(async () => {
  await pool.query('DELETE FROM "User" WHERE id = ANY($1)', [[alice, bob]]);
  await pool.end();
});

const events = async (id: string) => (await getJob(alice, id)).events.map((e: { event: string }) => e.event);
const row = async (id: string) => (await pool.query('SELECT * FROM "Job" WHERE id = $1', [id])).rows[0];

test("retry backoff doubles from 30 seconds and is capped at an hour", () => {
  expect([1, 2, 3, 4, 8, 20].map(retryDelaySeconds)).toEqual([30, 60, 120, 240, 3600, 3600]);
});

test("enqueue stores a validated payload and starts the event trail", async () => {
  const job = await enqueueJob(alice, TYPE, { windowStart: "2026-11-16T09:00:00-08:00", dailyStartHour: 8, dailyEndHour: 20, sneaky: "dropped" });
  expect(job).toMatchObject({ type: TYPE, status: "queued", attempts: 0, maxAttempts: 3, deduplicated: false });
  expect(job.payload).toEqual({ windowStart: "2026-11-16T17:00:00.000Z", dailyStartHour: 8, dailyEndHour: 20 });
  expect(await events(job.id)).toEqual(["queued"]);
});

test("enqueue refuses unknown types and bad payloads with a 400", async () => {
  await expect(enqueueJob(alice, "drop.database", {})).rejects.toMatchObject({ status: 400 });
  await expect(enqueueJob(alice, "toString", {})).rejects.toMatchObject({ status: 400 });
  await expect(enqueueJob(alice, TYPE, [] as never)).rejects.toMatchObject({ status: 400 });
  await expect(enqueueJob(alice, TYPE, { windowStart: "next tuesday" })).rejects.toMatchObject({ status: 400 });
  await expect(enqueueJob(alice, TYPE, { windowStart: "2026-11-16T00:00:00Z", windowEnd: "2026-11-15T00:00:00Z" })).rejects.toMatchObject({ status: 400 });
  await expect(enqueueJob(alice, TYPE, { windowStart: "2026-01-01T00:00:00Z", windowEnd: "2026-06-01T00:00:00Z" })).rejects.toMatchObject({ status: 400 });
  await expect(enqueueJob(alice, TYPE, { dailyStartHour: 9.5 })).rejects.toMatchObject({ status: 400 });
  await expect(enqueueJob(alice, TYPE, { dailyStartHour: 22, dailyEndHour: 6 })).rejects.toMatchObject({ status: 400 });
  await expect(enqueueJob(alice, TYPE, {}, { maxAttempts: 99 })).rejects.toMatchObject({ status: 400 });
  expect(await listJobs(alice)).toHaveLength(0);
});

test("the same open request is one job, not a pile of them", async () => {
  const first = await enqueueJob(alice, TYPE, { dailyStartHour: 8 });
  const again = await enqueueJob(alice, TYPE, { dailyStartHour: 8 });
  expect(again).toMatchObject({ id: first.id, deduplicated: true });

  expect((await enqueueJob(alice, TYPE, { dailyStartHour: 10 })).id).not.toBe(first.id); // different work
  expect((await enqueueJob(bob, TYPE, { dailyStartHour: 8 })).id).not.toBe(first.id);     // different student
  expect((await enqueueJob(alice, TYPE, { dailyStartHour: 8 }, { dedupeKey: null })).id).not.toBe(first.id); // opted out

  // Once the first one is finished, the same request is new work again.
  await pool.query("UPDATE \"Job\" SET status = 'completed' WHERE id = $1", [first.id]);
  expect(await enqueueJob(alice, TYPE, { dailyStartHour: 8 })).toMatchObject({ deduplicated: false });
});

test("a burst of identical requests at the same instant still makes one job", async () => {
  const burst = await Promise.all(Array.from({ length: 8 }, () => enqueueJob(alice, TYPE, {})));
  expect(new Set(burst.map(job => job.id)).size).toBe(1);
  expect(burst.filter(job => !job.deduplicated)).toHaveLength(1);
});

test("one student cannot fill the queue: past the cap new work is refused, finished work frees room", async () => {
  await pool.query(
    "INSERT INTO \"Job\" (\"userID\", type, \"dedupeKey\") SELECT $1, $2, 'filler-' || n FROM generate_series(1, $3) n",
    [alice, TYPE, MAX_OPEN_JOBS_PER_USER]
  );
  await expect(enqueueJob(alice, TYPE, {})).rejects.toMatchObject({ status: 429 });
  expect(await enqueueJob(bob, TYPE, {})).toMatchObject({ status: "queued" }); // other students are unaffected
  // Re-asking for something already queued is still answered, not counted against the cap.
  await pool.query("UPDATE \"Job\" SET \"dedupeKey\" = '{}' WHERE \"dedupeKey\" = 'filler-1'");
  expect(await enqueueJob(alice, TYPE, {})).toMatchObject({ deduplicated: true });

  await pool.query("UPDATE \"Job\" SET status = 'completed' WHERE \"dedupeKey\" = 'filler-2'");
  expect(await enqueueJob(alice, TYPE, { dailyStartHour: 7 })).toMatchObject({ deduplicated: false });
});

test("claim takes the oldest due job, leases it, and leaves future jobs alone", async () => {
  const later = await enqueueJob(alice, TYPE, { dailyStartHour: 1 });
  const sooner = await enqueueJob(alice, TYPE, { dailyStartHour: 2 }, { runAt: new Date(Date.now() - 60000) });
  await enqueueJob(alice, TYPE, { dailyStartHour: 3 }, { runAt: new Date(Date.now() + 3600000) });

  const first = await claimNextJob("worker-a");
  expect(first).toMatchObject({ id: sooner.id, status: "running", attempts: 1, lockedBy: "worker-a" });
  expect(new Date(first.lockedUntil).getTime()).toBeGreaterThan(Date.now() + 200000);
  expect((await claimNextJob("worker-a")).id).toBe(later.id);
  expect(await claimNextJob("worker-a")).toBeNull(); // the third is not due for an hour
  expect(await events(sooner.id)).toEqual(["queued", "started"]);
});

test("workers polling at once never get the same job", async () => {
  const queued = await Promise.all([1, 2, 3, 4, 5].map(hour => enqueueJob(alice, TYPE, { dailyStartHour: hour })));
  const claims = await Promise.all(Array.from({ length: 12 }, (_, i) => claimNextJob(`worker-${i}`)));
  const got = claims.filter(Boolean).map(job => job.id);
  expect(got).toHaveLength(5);
  expect(new Set(got)).toEqual(new Set(queued.map(job => job.id)));
});

test("complete stores the result, and only for the worker holding the lease", async () => {
  const { id } = await enqueueJob(alice, TYPE, {});
  const job = await claimNextJob("worker-a");
  expect(await completeJob(job, "worker-b", { stolen: true })).toBeNull();
  await logJobEvent(job, "placed 2 of 3 assignments", { placed: 2 });
  expect(await completeJob(job, "worker-a", { scheduled: 2, unscheduled: 1 })).toMatchObject({ status: "completed" });
  expect(await completeJob(job, "worker-a", { twice: true })).toBeNull();

  const done = await getJob(alice, id);
  expect(done).toMatchObject({ status: "completed", result: { scheduled: 2, unscheduled: 1 }, lastError: null });
  expect(done.finishedAt).toBeTruthy();
  expect(done.events.map((e: { event: string }) => e.event)).toEqual(["queued", "started", "log", "completed"]);
  expect(done.events[2]).toMatchObject({ message: "placed 2 of 3 assignments", data: { placed: 2 }, attempt: 1 });
});

test("a failed attempt is retried after a backoff, then fails for good when attempts run out", async () => {
  const { id } = await enqueueJob(alice, TYPE, {}, { maxAttempts: 2 });
  const first = await claimNextJob("worker-a");
  expect(await failJob(first, "worker-b", new Error("not yours"))).toBeNull();
  const retried = await failJob(first, "worker-a", new Error("Canvas timed out"));
  expect(retried).toMatchObject({ status: "queued", lastError: "Canvas timed out", lockedBy: null, finishedAt: null });
  const wait = new Date(retried.runAt).getTime() - Date.now();
  expect(wait).toBeGreaterThan(20000);
  expect(wait).toBeLessThanOrEqual(30000);
  expect(await claimNextJob("worker-a")).toBeNull(); // backing off

  await pool.query('UPDATE "Job" SET "runAt" = NOW() WHERE id = $1', [id]);
  const second = await claimNextJob("worker-a");
  expect(second.attempts).toBe(2);
  expect(await failJob(second, "worker-a", "still down")).toMatchObject({ status: "failed", lastError: "still down" });

  const failed = await getJob(alice, id);
  expect(failed.finishedAt).toBeTruthy();
  expect(failed.events.map((e: { event: string }) => e.event)).toEqual(["queued", "started", "retry_scheduled", "started", "failed"]);
  expect(failed.events[2]).toMatchObject({ message: "Canvas timed out", data: { retryInSeconds: 30 }, attempt: 1 });
});

test("an error a retry cannot fix fails the job on the first attempt", async () => {
  const { id } = await enqueueJob(alice, TYPE, {});
  const job = await claimNextJob("worker-a");
  expect(await failJob(job, "worker-a", new Error("x".repeat(5000)), { retry: false })).toMatchObject({ status: "failed", attempts: 1 });
  expect((await row(id)).lastError).toHaveLength(2000);
});

test("a job whose worker died is taken over once its lease runs out", async () => {
  const { id } = await enqueueJob(alice, TYPE, {});
  const stalled = await claimNextJob("worker-a");
  expect(await claimNextJob("worker-b")).toBeNull(); // still leased
  await pool.query("UPDATE \"Job\" SET \"lockedUntil\" = NOW() - INTERVAL '1 second' WHERE id = $1", [id]);

  const rescued = await claimNextJob("worker-b");
  expect(rescued).toMatchObject({ id, attempts: 2, lockedBy: "worker-b" });
  // The stalled worker wakes up late: it must not overwrite the attempt that replaced it.
  expect(await completeJob(stalled, "worker-a", { late: true })).toBeNull();
  expect(await completeJob(rescued, "worker-b", { ok: true })).toMatchObject({ status: "completed" });
  const trail = (await getJob(alice, id)).events;
  expect(trail[2].message).toBe("Taken over by worker-b after the previous worker's lease ran out");
});

test("a job that dies on its last attempt is failed, not run forever", async () => {
  const { id } = await enqueueJob(alice, TYPE, {}, { maxAttempts: 1 });
  await claimNextJob("worker-a");
  await pool.query("UPDATE \"Job\" SET \"lockedUntil\" = NOW() - INTERVAL '1 second' WHERE id = $1", [id]);
  expect(await claimNextJob("worker-b")).toBeNull();
  expect(await getJob(alice, id)).toMatchObject({ status: "failed", attempts: 1, lastError: "The worker stopped responding and no attempts were left" });
  expect(await events(id)).toEqual(["queued", "started", "failed"]);
});

test("students only ever see their own jobs, without lease internals", async () => {
  const mine = await enqueueJob(alice, TYPE, {});
  await enqueueJob(bob, TYPE, {});
  await expect(getJob(bob, mine.id)).rejects.toMatchObject({ status: 404 });
  await expect(getJob(alice, "not-a-uuid")).rejects.toMatchObject({ status: 404 });
  expect((await listJobs(alice)).map((job: { id: string }) => job.id)).toEqual([mine.id]);
  expect(Object.keys(publicJob(await row(mine.id)))).not.toEqual(expect.arrayContaining(["lockedBy", "lockedUntil", "dedupeKey"]));
});

test("the job list filters by status and checks its inputs", async () => {
  const a = await enqueueJob(alice, TYPE, { dailyStartHour: 1 });
  await enqueueJob(alice, TYPE, { dailyStartHour: 2 });
  await pool.query("UPDATE \"Job\" SET status = 'completed' WHERE id = $1", [a.id]);
  expect(await listJobs(alice, { status: "completed" })).toHaveLength(1);
  expect(await listJobs(alice, { status: "queued" })).toHaveLength(1);
  expect(await listJobs(alice, { limit: "1" })).toHaveLength(1);
  await expect(listJobs(alice, { status: "exploded" })).rejects.toMatchObject({ status: 400 });
  await expect(listJobs(alice, { limit: "0" })).rejects.toMatchObject({ status: 400 });
  await expect(listJobs(alice, { limit: "5000" })).rejects.toMatchObject({ status: 400 });
});
