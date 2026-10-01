import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test, expect } from "vitest";

// Keep the original node:test assertions, including nested cases and cleanup.
test("existing domain regression suite", async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", "--test", "test/domain/*.test.cjs"], { env: process.env, timeout: 60000 });
  expect(stdout).toMatch(/fail 0/);
  expect(stdout).toMatch(/skipped 0/);
}, 65000);
