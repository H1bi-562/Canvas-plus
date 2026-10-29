// src/lib/gradeImpact.ts
// UC14 – how much one assignment moves its course grade, from Canvas's grading
// categories (assignment groups) and their weights. Pure, so the what-if slider
// recomputes on every change (see test/gradeImpact.test.ts).
//
// It follows Canvas's "current grade": only graded work counts. A weighted
// course averages each category's percentage by weight, over the categories
// that have graded work; an unweighted one divides points earned by points
// possible.
// ponytail: ignores drop-lowest rules, and sync rounds fractional points, so it can sit a fraction of a
// percent off Canvas; store assignment_groups' rules and exact points_possible if that matters.

import type { Assignment } from "@/lib/assignmentsApi";

export type GradeRow = Pick<Assignment,
  "id" | "points" | "score" | "groupID" | "groupWeight" | "groupsWeighted" | "completionStatus">;

/** In a Canvas grading category (work left out of the grade has none) and not excused. */
export const countsTowardGrade = (row: GradeRow) => row.groupID != null && row.completionStatus !== "excused";

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/**
 * One course's grade in percent from its graded work, or null with nothing
 * graded. whatIf supplies (or replaces) scores by assignment id.
 */
export function courseGrade(rows: GradeRow[], whatIf: Record<string, number> = {}): number | null {
  const groups = new Map<string, { weight: number; earned: number; possible: number }>();
  for (const row of rows) {
    const score = row.id in whatIf ? whatIf[row.id] : row.score;
    if (!countsTowardGrade(row) || score == null) continue;
    const group = groups.get(row.groupID!) ?? { weight: row.groupWeight ?? 0, earned: 0, possible: 0 };
    group.earned += score;
    group.possible += row.points ?? 0;
    groups.set(row.groupID!, group);
  }

  const graded = [...groups.values()].filter((group) => group.possible > 0);
  if (graded.length === 0) return null;
  const weight = sum(graded.map((group) => group.weight));
  if (rows.some((row) => row.groupsWeighted) && weight > 0) {
    return sum(graded.map((group) => group.weight * group.earned / group.possible)) / weight * 100;
  }
  return sum(graded.map((group) => group.earned)) / sum(graded.map((group) => group.possible)) * 100;
}

/**
 * The fraction (0..1) of the final course grade this assignment is worth: its
 * category's weight, split across all of that category's points, graded or not.
 */
export function shareOfGrade(assignment: GradeRow, rows: GradeRow[]): number {
  if (!countsTowardGrade(assignment) || !assignment.points) return 0;
  const counted = rows.filter((row) => countsTowardGrade(row) && row.points);
  const points = (only = counted) => sum(only.map((row) => row.points!));

  const weights = new Map(counted.map((row) => [row.groupID, row.groupWeight ?? 0]));
  const totalWeight = sum([...weights.values()]);
  if (!assignment.groupsWeighted || totalWeight === 0) return assignment.points / points();

  const sameGroup = counted.filter((row) => row.groupID === assignment.groupID);
  return (assignment.groupWeight ?? 0) / totalWeight * assignment.points / points(sameGroup);
}
