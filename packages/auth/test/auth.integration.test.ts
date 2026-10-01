import { afterAll, expect, test } from "vitest";
import { pool } from "@canvasplus/database";
import { auth } from "../src/server";

afterAll(() => pool.end());
const email = `auth-${crypto.randomUUID()}@example.invalid`;
const password = "Regression-password-2026!";
const request = (path: string, body?: object, cookie = "") => auth.handler(new Request(`http://localhost:3000/api/auth/${path}`, {
  method: body ? "POST" : "GET",
  headers: { "Content-Type": "application/json", Origin: "http://localhost:3000", Cookie: cookie },
  ...(body ? { body: JSON.stringify(body) } : {})
}));

test("registration provisions config and logout revokes the authenticated session", async () => {
  const registered = await request("sign-up/email", { email, password, name: "Baseline" });
  expect(registered.status).toBe(200);
  const cookie = registered.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  const data = await registered.json();
  expect((await pool.query('SELECT id FROM "Config" WHERE "userID" = $1', [data.user.id])).rowCount).toBe(1);
  expect((await request("get-session", undefined, cookie)).status).toBe(200);
  const duplicate = await request("sign-up/email", { email, password, name: "Other" });
  expect(duplicate.ok).toBe(false);
  expect((await request("sign-in/email", { email, password: "incorrect-password" })).status).toBe(401);
  expect((await request("sign-out", {}, cookie)).ok).toBe(true);
  expect(await (await request("get-session", undefined, cookie)).json()).toBeNull();
  const login = await request("sign-in/email", { email, password });
  expect(login.ok).toBe(true);
  const freshCookie = login.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  await pool.query('UPDATE "AuthSession" SET "expiresAt" = NOW() - INTERVAL \'1 hour\' WHERE "userId" = $1', [data.user.id]);
  expect(await (await request("get-session", undefined, freshCookie)).json()).toBeNull();
});
