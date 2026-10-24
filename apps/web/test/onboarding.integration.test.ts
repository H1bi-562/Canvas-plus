// UC23 – onboarding progress: the Config columns, the query module, and the /api/onboarding routes.
import { afterAll, expect, test } from "vitest";
import { pool } from "@canvasplus/database";
import { auth } from "@canvasplus/auth/server";
import { getOnboarding, saveStep, completeOnboarding, resetOnboarding } from "@canvasplus/database/queries/onboarding";

afterAll(() => pool.end());

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

test("complete records the tour and a finish time; reset clears both", async () => {
  const { user } = await register();
  const done = await completeOnboarding(user.id);
  expect(done.steps.tour).toBe("done");
  expect(Number.isNaN(Date.parse(done.completedAt!))).toBe(false);
  expect(await resetOnboarding(user.id)).toEqual({ steps: {}, completedAt: null, nextStep: "canvas" });
});

test("an account without a Config row can still onboard", async () => {
  const { user } = await register();
  await pool.query('DELETE FROM "Config" WHERE "userID" = $1', [user.id]);
  expect((await getOnboarding(user.id)).nextStep).toBe("canvas");
  expect((await saveStep(user.id, "canvas", "done")).steps).toEqual({ canvas: "done" });
});
