import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { TestProject } from "vitest/node";

export default async function setup(project: TestProject) {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error("Set TEST_DATABASE_URL to an explicitly selected test PostgreSQL database.");
  const schema = `cp_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  try {
    await admin.query("BEGIN");
    await admin.query(`SET LOCAL search_path TO "${schema}"`);
    const folder = new URL("../drizzle/", import.meta.url);
    for (const file of (await readdir(folder)).filter(f => f.endsWith(".sql")).sort()) {
      const migration = (await readFile(new URL(file, folder), "utf8")).replaceAll('"public".', `"${schema}".`);
      await admin.query(migration);
    }
    await admin.query("COMMIT");
    const url = new URL(connectionString);
    url.searchParams.set("options", `-c search_path=${schema}`);
    project.config.env ??= {};
    project.config.env.TEST_DATABASE_URL = url.toString();
    project.config.env.BETTER_AUTH_URL = "http://localhost:3000";
    project.config.env.BETTER_AUTH_SECRET = "test-only-secret-with-at-least-thirty-two-characters";
    project.config.env.ENCRYPTION_KEY = "ab".repeat(32);
    return async () => { await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); };
  } catch (error) {
    await admin.query("ROLLBACK");
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
    throw error;
  }
}
