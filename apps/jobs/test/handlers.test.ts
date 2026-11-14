import { expect, test } from "vitest";
import { JOB_TYPES } from "@canvasplus/database/queries/jobs";
import { handlers } from "../src/handlers";
import { formatLog } from "../src/logger";

test("every job type the API accepts has a handler, and nothing else does", () => {
  expect(Object.keys(handlers).sort()).toEqual(Object.keys(JOB_TYPES).sort());
});

test("a log line is one JSON object carrying the fields needed to trace a job", () => {
  const line = formatLog("error", "job.failed", { jobID: "j1", attempt: 2, error: "Canvas timed out" }, new Date("2026-11-14T18:00:00Z"));
  expect(line).not.toContain("\n");
  expect(JSON.parse(line)).toEqual({ time: "2026-11-14T18:00:00.000Z", level: "error", source: "jobs", event: "job.failed", jobID: "j1", attempt: 2, error: "Canvas timed out" });
});
