// UC7 estimator rules. Pure -- no database, runs in the normal `pnpm test`.
import { test, expect } from "vitest";
import { estimateMinutes } from "@canvasplus/database/queries/estimateModel";

test("points drive the estimate at the default pace", () => {
  expect(estimateMinutes({ points: 100 })).toBe(300);
  expect(estimateMinutes({ points: 10 })).toBe(30);
});

test("no points falls back to a baseline", () => {
  expect(estimateMinutes({ points: null })).toBe(45);
  expect(estimateMinutes({ points: 0 })).toBe(45);
});

test("high priority and subtasks lengthen the estimate", () => {
  expect(estimateMinutes({ points: 100, priorityScore: 80 })).toBe(375);
  expect(estimateMinutes({ points: 100, priorityScore: 50, hasSubtasks: true })).toBe(380);
});

test("a calibrated pace personalizes the estimate", () => {
  expect(estimateMinutes({ points: 20 }, { minutesPerPoint: 5 })).toBe(100);
});

test("results stay within the allowed range", () => {
  expect(estimateMinutes({ points: 6000 })).toBe(6000);
  expect(estimateMinutes({ points: 1 }, { minutesPerPoint: 0.5 })).toBe(5);
});

test("an absurd pace is clamped, not trusted", () => {
  expect(estimateMinutes({ points: 10 }, { minutesPerPoint: 999 })).toBe(300);
});
