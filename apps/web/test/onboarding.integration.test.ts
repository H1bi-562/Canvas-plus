// UC23 – onboarding progress: the Config columns, the query module, and the /api/onboarding routes.
import { afterAll, expect, test } from "vitest";
import { pool } from "@canvasplus/database";
import { auth } from "@canvasplus/auth/server";
import { getOnboarding, saveStep, completeOnboarding, resetOnboarding, ONBOARDING_STEPS as SERVER_STEPS } from "@canvasplus/database/queries/onboarding";
import { ONBOARDING_STEPS as CLIENT_STEPS } from "@/lib/onboarding";
import { GET as get, PATCH as patch, DELETE as reset } from "../app/api/onboarding/route";
import { POST as complete } from "../app/api/onboarding/complete/route";

afterAll(() => pool.end());
const req = (method = "GET", cookie = "", body?: object, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/onboarding", { method, headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });

async function register() {
  const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" }, body: JSON.stringify({ name: "Test", email: `${crypto.randomUUID()}@example.invalid`, password: "Regression-password-2026!" }) }));
  expect(response.ok).toBe(true);
  return { cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; "), user: (await response.json()).user };
}

test("a new account starts at the Canvas step", async () => {
  const { user } = await register();
  expect(await getOnboarding(user.id)).toEqual({ steps: {}, completedAt: null, nextStep: "canvas" });
});

test("skipped steps count as recorded", async () => {
  const { user } = await register();
  await saveStep(user.id, "canvas", "skipped");
  const state = await saveStep(user.id, "google", "done");
  expect(state.steps).toEqual({ canvas: "skipped", google: "done" });
  expect(state.nextStep).toBe("sync");
});

test("unknown steps and statuses are rejected with 400 and change nothing", async () => {
  const { user } = await register();
  await expect(saveStep(user.id, "billing", "done")).rejects.toMatchObject({ status: 400 });
  await expect(saveStep(user.id, "canvas", "maybe")).rejects.toMatchObject({ status: 400 });
  expect((await getOnboarding(user.id)).steps).toEqual({});
});

test("parallel saves keep both steps", async () => {
  const { user } = await register();
  await Promise.all([saveStep(user.id, "canvas", "done"), saveStep(user.id, "google", "skipped")]);
  expect((await getOnboarding(user.id)).steps).toEqual({ canvas: "done", google: "skipped" });
});

test("complete sets a finish time but leaves the walkthrough to record the tour; reset clears both", async () => {
  const { user } = await register();
  const done = await completeOnboarding(user.id);
  expect(done.steps.tour).toBeUndefined();
  expect(Number.isNaN(Date.parse(done.completedAt!))).toBe(false);
  expect(await resetOnboarding(user.id)).toEqual({ steps: {}, completedAt: null, nextStep: "canvas" });
});

test("an account without a Config row can still onboard", async () => {
  const { user } = await register();
  await pool.query('DELETE FROM "Config" WHERE "userID" = $1', [user.id]);
  expect((await getOnboarding(user.id)).nextStep).toBe("canvas");
  expect((await saveStep(user.id, "canvas", "done")).steps).toEqual({ canvas: "done" });
});

test("routes save, complete and reset progress per user", async () => {
  const alice = await register();
  const bob = await register();
  expect((await patch(req("PATCH", alice.cookie, { step: "canvas", status: "done" }))).status).toBe(200);
  expect((await (await get(req("GET", bob.cookie))).json()).nextStep).toBe("canvas");
  expect((await patch(req("PATCH", alice.cookie, { step: "nope", status: "done" }))).status).toBe(400);
  expect((await complete(req("POST", alice.cookie, {}))).status).toBe(200);
  expect((await (await reset(req("DELETE", alice.cookie))).json()).completedAt).toBeNull();
});

test("an untrusted origin cannot change progress", async () => {
  const { cookie } = await register();
  expect((await patch(req("PATCH", cookie, { step: "canvas", status: "done" }, "https://untrusted.example"))).status).toBe(403);
});

test("client and server step lists match", () => {
  expect([...CLIENT_STEPS]).toEqual(SERVER_STEPS);
});
