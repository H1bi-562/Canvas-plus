import type { Assignment, PriorityLevel, PriorityScore, UserConfig } from "../src/types";
import { estimateAssignmentHours, DEFAULT_CONFIG } from "./estimateService";

const WEIGHTS = { urgency: 0.5, impact: 0.3, effort: 0.2 } as const;

function urgencyScore(dueDate: string, now: Date): number {
  const hoursLeft = (new Date(dueDate).getTime() - now.getTime()) / 36e5;
  if (hoursLeft <= 0) return 100; // overdue
  if (hoursLeft <= 24) return 90;
  if (hoursLeft <= 72) return 70;
  if (hoursLeft <= 168) return 40;
  return Math.max(5, 40 - (hoursLeft - 168) / 24); // decays over time
}

function impactScore(assignment: Assignment): number {
  // combines raw points and how much the course category counts
  const points = Math.min(assignment.pointsPossible || 0, 100) / 100;
  const weight = Math.min(assignment.courseWeight || 0, 1);
  return Math.round((points * 0.5 + weight * 0.5) * 100);
}

function effortScore(hours: number): number {
  // bigger tasks should be started earlier, so they score higher
  return Math.min(100, hours * 15);
}

export function scoreAssignment(
  assignment: Assignment,
  config: UserConfig = DEFAULT_CONFIG,
  now: Date = new Date()
): PriorityScore {
  const hours = estimateAssignmentHours([assignment], config);
  const urgency = urgencyScore(assignment.dueDate, now);
  const impact = impactScore(assignment);
  const effort = effortScore(hours);

  const score =
    urgency * WEIGHTS.urgency + impact * WEIGHTS.impact + effort * WEIGHTS.effort;

  const level: PriorityLevel = score >= 70 ? "high" : score >= 40 ? "medium" : "low";

  return {
    id: assignment.id,
    score: Math.round(score),
    level,
    breakdown: { urgency, impact, effort },
  };
}

// Jace's caching task can wrap this function
export function computeScores(
  assignments: Assignment[],
  config: UserConfig,
  now: Date = new Date()
): PriorityScore[] {
  return assignments
    .filter((a) => a.status !== "done")
    .map((a) => scoreAssignment(a, config, now))
    .sort((a, b) => b.score - a.score);
}