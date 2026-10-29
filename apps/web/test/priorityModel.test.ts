// UC15 priority rules. Pure -- no database, runs in the normal `pnpm test`.
import { test, expect } from "vitest";
import { rankPriorities, isOpen } from "@canvasplus/database/queries/priorityModel";

const NOW = Date.parse("2026-10-22T12:00:00Z");
const inHours = (hours: number) => new Date(NOW + hours * 3_600_000).toISOString();

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: id, courseID: "c1", points: 10, dueAt: inHours(24 * 7), availableUntil: null,
  estimatedMinutes: 60, loggedSeconds: 0, completionStatus: "pending", priorityScore: null, ...extra
});

test("finished, excused and locked work is not ranked", () => {
  const ranked = rankPriorities([
    row("open"),
    row("submitted", { completionStatus: "submitted" }),
    row("done", { completionStatus: "done" }),
    row("excused", { completionStatus: "excused" }),
    row("locked", { completionStatus: "missing", availableUntil: inHours(-1) })
  ], NOW);
  expect([...ranked.keys()]).toEqual(["open"]);
  expect(isOpen(row("late", { completionStatus: "missing", availableUntil: inHours(2) }), NOW)).toBe(true);
});

test("sooner due work outranks the same work due later", () => {
  const ranked = rankPriorities([row("later", { dueAt: inHours(24 * 10) }), row("tomorrow", { dueAt: inHours(24) })], NOW);
  expect(ranked.get("tomorrow")!.rank).toBe(1);
  expect(ranked.get("tomorrow")!.score).toBeGreaterThan(ranked.get("later")!.score);
});

test("overdue work with no slack scores full urgency", () => {
  const ranked = rankPriorities([row("late", { dueAt: inHours(-5), completionStatus: "overdue" })], NOW);
  // Only open item: urgency 1, impact 1, effort 1.
  expect(ranked.get("late")).toEqual({ score: 100, rank: 1, reason: "Overdue · 100% of course points" });
});

test("a big share of course points lifts an assignment", () => {
  const ranked = rankPriorities([
    row("quiz", { points: 10 }),
    row("project", { points: 200, courseID: "c1" }),
    row("submitted", { points: 790, courseID: "c1", completionStatus: "submitted" })
  ], NOW);
  expect(ranked.get("project")!.rank).toBe(1);
  expect(ranked.get("project")!.reason).toContain("20% of course points");
});

test("more work left means less slack and a higher score", () => {
  const ranked = rankPriorities([
    row("started", { estimatedMinutes: 600, loggedSeconds: 540 * 60 }),
    row("untouched", { estimatedMinutes: 600 })
  ], NOW);
  expect(ranked.get("untouched")!.rank).toBe(1);
});

test("no due date ranks last; a stored score still wins", () => {
  const ranked = rankPriorities([row("someday", { dueAt: null }), row("soon", { dueAt: inHours(48) })], NOW);
  expect(ranked.get("someday")!.rank).toBe(2);
  expect(rankPriorities([row("ai", { priorityScore: 42 })], NOW).get("ai")!.score).toBe(42);
});
