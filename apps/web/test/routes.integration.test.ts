import { afterAll, expect, test } from "vitest";
import { pool } from "@canvasplus/database";
import { auth } from "@canvasplus/auth/server";
import { POST as createAssignment } from "../app/api/assignments/route";
import { GET as getAssignment, DELETE as deleteAssignment } from "../app/api/assignments/[id]/route";
import { PATCH as estimate } from "../app/api/assignments/[id]/estimate/route";
import { POST as start } from "../app/api/sessions/start/route";
import { PATCH as pause } from "../app/api/sessions/[id]/pause/route";
import { PATCH as resume } from "../app/api/sessions/[id]/resume/route";
import { PATCH as end } from "../app/api/sessions/[id]/end/route";
import { GET as active } from "../app/api/sessions/active/route";
import { POST as event } from "../app/api/calendar/route";
import { GET as config, PUT as saveConfig } from "../app/api/config/route";

afterAll(() => pool.end());
const req = (method = "GET", cookie = "", body?: object, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/test", { method, headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function register() {
  const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" }, body: JSON.stringify({ name: "Test", email: `${crypto.randomUUID()}@example.invalid`, password: "Regression-password-2026!" }) }));
  expect(response.ok).toBe(true);
  return { cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; "), user: (await response.json()).user };
}

test("HTTP handlers enforce ownership, secret redaction, and session expiration", async () => {
  const alice = await register();
  const bob = await register();
  const created = await createAssignment(req("POST", alice.cookie, { title: "Private", courseID: crypto.randomUUID(), courseName: "Private course", points: 0 }));
  expect(created.status).toBe(201);
  const assignment = await created.json();
  expect(assignment.points).toBe(0);
  expect((await getAssignment(req("GET", bob.cookie), params(assignment.id))).status).toBe(404);
  expect((await deleteAssignment(req("DELETE", bob.cookie), params(assignment.id))).status).toBe(404);
  expect((await estimate(req("PATCH", bob.cookie, { minutes: 30 }), params(assignment.id))).status).toBe(404);
  expect((await start(req("POST", bob.cookie, { assignmentID: assignment.id }))).status).toBe(404);
  expect((await event(req("POST", bob.cookie, { assignmentID: assignment.id, eventStart: new Date().toISOString(), eventEnd: new Date().toISOString() }))).status).toBe(404);
  expect((await start(req("POST", alice.cookie, {}, "https://untrusted.example"))).status).toBe(403);
  expect((await saveConfig(req("PUT", alice.cookie, { modelKey: "private-api-key" }))).status).toBe(200);
  const settings = await (await config(req("GET", alice.cookie))).json();
  expect(JSON.stringify(settings)).not.toContain("private-api-key");
  const stored = await pool.query('SELECT "modelKey" FROM "Config" WHERE "userID" = $1', [alice.user.id]);
  expect(stored.rows[0].modelKey).not.toBe("private-api-key");
  await pool.query('UPDATE "AuthSession" SET "expiresAt" = NOW() - INTERVAL \'1 hour\' WHERE "userId" = $1', [alice.user.id]);
  expect((await active(req("GET", alice.cookie))).status).toBe(401);
});

test("concurrent starts and pause/resume preserve exactly one timer and exclude paused time", async () => {
  const { cookie } = await register();
  const starts = await Promise.all([start(req("POST", cookie, {})), start(req("POST", cookie, {}))]);
  expect(starts.map(r => r.status).sort()).toEqual([201, 409]);
  const timer = await starts.find(r => r.status === 201)!.json();
  await pool.query('UPDATE "StudySession" SET "startedAt" = NOW() - INTERVAL \'60 seconds\' WHERE id = $1', [timer.id]);
  const paused = await (await pause(req("PATCH", cookie, {}), params(timer.id))).json();
  expect(paused.durationSeconds).toBeGreaterThanOrEqual(60);
  await pool.query('UPDATE "StudySession" SET "pausedAt" = NOW() - INTERVAL \'1 hour\' WHERE id = $1', [timer.id]);
  const restored = await (await active(req("GET", cookie))).json();
  expect(restored.session.status).toBe("paused");
  expect(restored.session.elapsedSeconds).toBe(paused.durationSeconds);
  expect((await resume(req("PATCH", cookie, {}), params(timer.id))).status).toBe(200);
  await pool.query('UPDATE "StudySession" SET "resumedAt" = NOW() - INTERVAL \'30 seconds\' WHERE id = $1', [timer.id]);
  const completed = await (await end(req("PATCH", cookie, {}), params(timer.id))).json();
  expect(completed.durationSeconds).toBeGreaterThanOrEqual(90);
  expect(completed.durationSeconds).toBeLessThan(100);
  expect((await (await active(req("GET", cookie))).json()).session).toBeNull();
});

test("Canvas configuration errors remain actionable", async () => {
  const { GET: authorize } = await import("../app/api/canvas/authorize/route");
  const { cookie } = await register();
  const saved = process.env.CANVAS_CLIENT_ID;
  delete process.env.CANVAS_CLIENT_ID;
  try {
    const response = await authorize(req("GET", cookie));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("Canvas OAuth is not configured");
  } finally {
    if (saved === undefined) delete process.env.CANVAS_CLIENT_ID;
    else process.env.CANVAS_CLIENT_ID = saved;
  }
});

test("invalid analytics end dates return 400", async () => {
  const { GET: analytics } = await import("../app/api/analytics/summary/route");
  const { cookie } = await register();
  const response = await analytics(new Request("http://localhost:3000/api/analytics/summary?tz=UTC&to=invalid", { headers: { Cookie: cookie } }));
  expect(response.status).toBe(400);
});
