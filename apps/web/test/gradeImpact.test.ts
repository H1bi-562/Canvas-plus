// UC14 grade math. Pure -- no database, runs in the normal `pnpm test`.
import { test, expect } from "vitest";
import { courseGrade, shareOfGrade, type GradeRow } from "@/lib/gradeImpact";

const row = (id: string, extra: Partial<GradeRow> = {}): GradeRow => ({
  id, points: 10, score: null, groupID: "g1", groupWeight: 30, groupsWeighted: true, completionStatus: "pending", ...extra
});

// Reviews (30%): r1 9/10. Deliverables (70%): d1 10/20, d2 ungraded 20 pts.
const weighted = [
  row("r1", { score: 9 }),
  row("d1", { points: 20, score: 10, groupID: "g2", groupWeight: 70 }),
  row("d2", { points: 20, groupID: "g2", groupWeight: 70 })
];

test("weighted courses average category percentages by weight", () => {
  expect(courseGrade(weighted)).toBeCloseTo(62); // 30 × 90% + 70 × 50%
  // Only categories with graded work count, re-normalised like Canvas's current grade.
  expect(courseGrade(weighted.slice(0, 1))).toBeCloseTo(90);
});

test("a what-if score supplies or replaces a grade", () => {
  expect(courseGrade(weighted, { d2: 20 })).toBeCloseTo(79.5); // Deliverables 30/40
  expect(courseGrade(weighted, { r1: 10 })).toBeCloseTo(65);
  expect(courseGrade([row("x")], { x: 7 })).toBeCloseTo(70);
});

test("unweighted courses divide points earned by points possible", () => {
  const points = weighted.map((r) => ({ ...r, groupsWeighted: false }));
  expect(courseGrade(points)).toBeCloseTo(19 / 30 * 100);
  expect(shareOfGrade(points[2], points)).toBeCloseTo(20 / 50);
});

test("share of the final grade follows the category weight", () => {
  expect(shareOfGrade(weighted[2], weighted)).toBeCloseTo(0.35); // 70% × 20/40 pts
  expect(shareOfGrade(weighted[0], weighted)).toBeCloseTo(0.3);
});

test("excused, ungraded and uncategorised work does not count", () => {
  const rows = [row("ex", { score: 0, completionStatus: "excused" }), row("none", { score: 0, groupID: null }), row("todo")];
  expect(courseGrade(rows)).toBeNull();
  expect(shareOfGrade(rows[1], rows)).toBe(0);
  expect(shareOfGrade(row("free", { points: 0 }), rows)).toBe(0);
});
