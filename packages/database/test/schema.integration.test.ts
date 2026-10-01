import { afterAll, expect, test } from "vitest";
import { db, pool } from "../src/client";
import { user, studySession } from "../src/schema";

const ids: string[] = [];
afterAll(async () => {
  for (const id of ids) await pool.query('DELETE FROM "User" WHERE id = $1', [id]);
  await pool.end();
});

test("one open timer per user, with completed history allowed", async () => {
  const [alice, bob] = await db.insert(user).values([
    { name: "Alice", email: `alice-${crypto.randomUUID()}@example.invalid` },
    { name: "Bob", email: `bob-${crypto.randomUUID()}@example.invalid` }
  ]).returning();
  ids.push(alice.id, bob.id);
  await db.insert(studySession).values({ userID: alice.id, status: "paused" });
  await expect(db.insert(studySession).values({ userID: alice.id })).rejects.toThrow();
  await expect(db.insert(studySession).values({ userID: bob.id })).resolves.toBeDefined();
  await expect(db.insert(studySession).values({ userID: alice.id, status: "completed" })).resolves.toBeDefined();
});
