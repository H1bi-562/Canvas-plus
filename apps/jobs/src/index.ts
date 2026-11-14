// UC16 – entry point for the job worker: `pnpm dev:jobs` (or `pnpm --filter @canvasplus/jobs start`).
// Reads the same root .env as the web app; DATABASE_URL is the only setting it needs.

import { hostname } from "node:os";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// Before the database client is imported: it reads DATABASE_URL as it loads.
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const { pool } = await import("@canvasplus/database");
const { runWorker } = await import("./worker");

const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => stop.abort());

try {
  await runWorker({ workerID: `${hostname()}-${process.pid}`, signal: stop.signal });
} finally {
  await pool.end();
}
