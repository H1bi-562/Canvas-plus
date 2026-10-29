// subtaskTypes.ts
// Types used by routes/subtasks.ts. Put this file in the same folder as the route.

export type AssignmentStatus = "todo" | "in_progress" | "done";

export interface Subtask {
  id: number;
  assignmentId: string;
  title: string;
  estimatedHours: number;
  status: AssignmentStatus;
  position: number;
}

export interface SubtaskRollup {
  total: number;
  done: number;
  remainingHours: number;
  progressPct: number;
}