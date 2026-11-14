import { afterAll, expect, test } from "vitest";
import { pool } from "@canvasplus/database";
import { auth } from "@canvasplus/auth/server";
import { claimNextJob, completeJob } from "@canvasplus/database/queries/jobs";
import { GET as list, POST as submit } from "../app/api/jobs/route";
import { GET as read } from "../app/api/jobs/[id]/route";

// UC16: the job queue over HTTP -- submitting work and reading back what became of it.
afterAll(() => pool.end());
const req = (method = "GET", cookie = "", body?: object, { origin = "http://localhost:3000", query = "" } = {}) =>
  new Request(`http://localhost:3000/api/jobs${query}`, { method, headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function register() {
  const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" }, body: JSON.stringify({ name: "Test", email: `${crypto.randomUUID()}@example.invalid`, password: "Regression-password-2026!" }) }));
  expect(response.ok).toBe(true);
  return { cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; "), user: (await response.json()).user };
}

test("submitting needs a signed-in student, a trusted origin, a known type, and a valid payload", async () => {
  const { cookie } = await register();
  const job = { type: "schedule.assignments", payload: {} };
  expect((await submit(req("POST", "", job))).status).toBe(401);
  expect((await submit(req("POST", cookie, job, { origin: "https://untrusted.example" }))).status).toBe(403);
  expect((await submit(req("POST", cookie, { type: "drop.database" }))).status).toBe(400);
  expect((await submit(req("POST", cookie, { payload: {} }))).status).toBe(400);
  expect((await submit(req("POST", cookie, { type: "schedule.assignments", payload: "tomorrow" }))).status).toBe(400);
  const bad = await submit(req("POST", cookie, { type: "schedule.assignments", payload: { dailyStartHour: 30 } }));
  expect(bad.status).toBe(400);
  expect((await bad.json()).error).toBe("dailyStartHour must be a whole hour from 0 to 24");
  expect(await (await list(req("GET", cookie))).json()).toEqual([]);
});

test("a submitted job is accepted, deduplicated, and can be followed to its result", async () => {
  await pool.query('DELETE FROM "Job"'); // the claim below must take this test's job
  const alice = await register();
  const bob = await register();

  const accepted = await submit(req("POST", alice.cookie, { type: "schedule.assignments", payload: { dailyStartHour: 8, dailyEndHour: 20 } }));
  expect(accepted.status).toBe(202);
  const job = await accepted.json();
  expect(job).toMatchObject({ status: "queued", type: "schedule.assignments", payload: { dailyStartHour: 8, dailyEndHour: 20 }, deduplicated: false });
  expect(job).not.toHaveProperty("lockedBy");

  // A double click is still one job.
  const again = await (await submit(req("POST", alice.cookie, { type: "schedule.assignments", payload: { dailyStartHour: 8, dailyEndHour: 20 } }))).json();
  expect(again).toMatchObject({ id: job.id, deduplicated: true });

  // Nobody else can read it, by id or by listing.
  expect((await read(req("GET", bob.cookie), params(job.id))).status).toBe(404);
  expect(await (await list(req("GET", bob.cookie))).json()).toEqual([]);
  expect((await read(req("GET", alice.cookie), params("not-a-uuid"))).status).toBe(400);

  // A worker picks it up: the student sees it running, then completed with the result.
  const claimed = await claimNextJob("test-worker");
  expect(claimed.id).toBe(job.id);
  expect(await (await read(req("GET", alice.cookie), params(job.id))).json()).toMatchObject({ status: "running", attempts: 1 });
  expect((await (await list(req("GET", alice.cookie, undefined, { query: "?status=running" }))).json()).map((j: { id: string }) => j.id)).toEqual([job.id]);
  expect(await (await list(req("GET", alice.cookie, undefined, { query: "?status=failed" }))).json()).toEqual([]);

  await completeJob(claimed, "test-worker", { scheduled: [], unscheduled: [] });
  const done = await (await read(req("GET", alice.cookie), params(job.id))).json();
  expect(done).toMatchObject({ status: "completed", result: { scheduled: [], unscheduled: [] }, lastError: null });
  expect(done.events.map((e: { event: string }) => e.event)).toEqual(["queued", "started", "completed"]);

  expect((await list(req("GET", alice.cookie, undefined, { query: "?status=exploded" }))).status).toBe(400);
  expect((await list(req("GET", alice.cookie, undefined, { query: "?limit=0" }))).status).toBe(400);
});
