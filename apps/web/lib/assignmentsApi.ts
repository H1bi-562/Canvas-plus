// src/lib/assignmentsApi.ts
// Assignments as the UI shows them. Rows come from GET /api/assignments, which
// returns Canvas-synced and demo assignments in the same shape.

import { apiRequest } from "@/lib/apiClient";
import { priorityLevel, type PriorityLevel } from "@canvasplus/ui/PriorityList";

/** Raw row from GET /api/assignments. */
interface AssignmentRow {
  id: string;
  title: string;
  description: string | null;
  points: number | null;
  dueAt: string | null;
  courseID: string;
  courseName: string;
  courseCode: string | null;
  htmlURL: string | null;
  isDemo: boolean;
  /** UC15 importance (0-100) and rank among the open work; null once finished. */
  priorityScore: number | null;
  priorityRank: number | null;
  priorityReason: string | null;
  summary?: string | null;
  subtasks?: string[] | null;
  estimatedMinutes: number | null;
  estimateSource: "student" | "ai" | null;
  submittedAt: string | null;
  completedAt: string | null;
  loggedSeconds: number;
  completionStatus: CompletionStatus;
  score: number | null;
  groupID: string | null;
  groupName: string | null;
  groupWeight: number | null;
  groupsWeighted: boolean;
}

/** Computed server-side from Canvas's submission and the student's "Mark done". */
export type CompletionStatus =
  | "pending" | "overdue" | "submitted" | "done" | "late" | "missing" | "excused";

/** Statuses where the work is handed in (on time or not) or waived. */
export const FINISHED_STATUSES: ReadonlySet<CompletionStatus> =
  new Set(["submitted", "done", "late", "excused"]);

export type Priority = PriorityLevel;

export interface Assignment {
  id: string;
  title: string;
  description: string;
  /** Local calendar date, YYYY-MM-DD, or '' when Canvas has no due date. */
  dueDate: string;
  /** Human-readable due date for display. */
  dueLabel: string;
  dueAt: string | null;
  priority: Priority;
  priorityScore: number | null;
  priorityRank: number | null;
  priorityReason: string | null;
  points: number | null;
  courseID: string;
  courseName: string;
  courseCode: string | null;
  htmlURL: string | null;
  isDemo: boolean;
  summary?: string | null;
  subtasks?: string[] | null;
  estimatedMinutes: number | null;
  estimateSource: "student" | "ai" | null;
  /** Active minutes from finished study sessions on this assignment. */
  loggedMinutes: number;
  completionStatus: CompletionStatus;
  submittedAt: string | null;
  completedAt: string | null;
  /** UC14: the student's Canvas score; null until graded. */
  score: number | null;
  /** Canvas grading category; null when the assignment does not count toward the grade. */
  groupID: string | null;
  groupName: string | null;
  /** The category's weight in percent; only meaningful when groupsWeighted. */
  groupWeight: number | null;
  /** The course weights its categories; otherwise it grades by total points. */
  groupsWeighted: boolean;
}

/** Canvas descriptions are HTML; the cards show plain text. */
function toPlainText(html: string | null): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

function localDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The server scores every open assignment (UC15, or a stored UC10 AI score).
 * No score means finished or locked by Canvas: nothing left to do.
 */
function priorityFor(row: AssignmentRow): Priority {
  return row.priorityScore == null ? "Low" : priorityLevel(row.priorityScore);
}

function dueLabelFor(dueAt: string | null, now: number): string {
  if (!dueAt) return "No due date";
  const due = new Date(dueAt);
  const label = due.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  });
  return due.getTime() < now ? `Overdue · ${label}` : label;
}

export function toAssignment(row: AssignmentRow, now: number = Date.now()): Assignment {
  return {
    id: row.id,
    title: row.title,
    description: toPlainText(row.description),
    dueDate: row.dueAt ? localDateKey(new Date(row.dueAt)) : "",
    dueLabel: dueLabelFor(row.dueAt, now),
    dueAt: row.dueAt,
    priority: priorityFor(row),
    priorityScore: row.priorityScore,
    priorityRank: row.priorityRank,
    priorityReason: row.priorityReason,
    points: row.points,
    courseID: row.courseID,
    courseName: row.courseName,
    courseCode: row.courseCode,
    htmlURL: row.htmlURL,
    isDemo: Boolean(row.isDemo),
    summary: row.summary ?? null,
    subtasks: row.subtasks ?? null,
    estimatedMinutes: row.estimatedMinutes,
    estimateSource: row.estimateSource,
    loggedMinutes: Math.round((row.loggedSeconds || 0) / 60),
    completionStatus: row.completionStatus || "pending",
    submittedAt: row.submittedAt,
    completedAt: row.completedAt,
    score: row.score ?? null,
    groupID: row.groupID ?? null,
    groupName: row.groupName ?? null,
    groupWeight: row.groupWeight ?? null,
    groupsWeighted: Boolean(row.groupsWeighted)
  };
}

/** refresh: let the server re-sync Canvas first if its copy is stale (UC15). */
export async function fetchAssignments(refresh = false): Promise<Assignment[]> {
  const rows = await apiRequest<AssignmentRow[]>(refresh ? "/api/assignments?refresh=stale" : "/api/assignments");
  const now = Date.now();
  return rows.map((row) => toAssignment(row, now));
}

/** 45 -> "45m", 90 -> "1h 30m", 120 -> "2h". */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export interface EstimateSuggestion {
  assignmentID: string;
  suggestedMinutes: number;
  basis: {
    points: number | null;
    priorityScore: number | null;
    minutesPerPoint: number;
    /** true once it reflects the student's own study history, not the default. */
    calibrated: boolean;
  };
}

/** UC7: fetch the system-computed time-to-finish suggestion for one assignment. */
export function fetchSuggestedEstimate(assignmentID: string) {
  return apiRequest<EstimateSuggestion>(`/api/assignments/${assignmentID}/estimate`);
}

/**
 * Save an estimate in whole minutes, or clear it with null. Source defaults to
 * 'student'; pass 'ai' when the student accepts the UC7 suggestion.
 */
export function saveEstimate(
  assignmentID: string,
  minutes: number | null,
  source: "student" | "ai" = "student"
) {
  return apiRequest<{ assignmentID: string; estimatedMinutes: number | null; estimateSource: "student" | "ai" | null }>(
    `/api/assignments/${assignmentID}/estimate`, "PATCH", { minutes, source }
  );
}

/** UC13: an AI-generated summary of an assignment's description. */
export interface SummaryResult {
  assignmentID: string;
  summary: string;
  /** 'ai' when a real LLM produced it, otherwise the deterministic summary. */
  source: "ai" | "extractive" | "extractive-fallback";
}

/** UC13: generate and store an AI summary for one assignment. */
export function generateSummary(assignmentID: string) {
  return apiRequest<SummaryResult>(`/api/assignments/${assignmentID}/summary`, "POST", {});
}

/** UC10: an AI-generated checklist of subtasks for an assignment. */
export interface SubtaskResult {
  assignmentID: string;
  subtasks: string[];
  /** 'ai' when a real LLM produced it, otherwise the deterministic breakdown. */
  source: "ai" | "extractive" | "extractive-fallback";
}

/** UC10: break an assignment into a subtask checklist and store it. */
export function generateSubtasks(assignmentID: string) {
  return apiRequest<SubtaskResult>(`/api/assignments/${assignmentID}/subtasks`, "POST", {});
}

/** "Mark done" (true) or undo it (false). Canvas sync never overwrites this. */
export function saveCompleted(assignmentID: string, completed: boolean) {
  return apiRequest<{ assignmentID: string; completedAt: string | null; completionStatus: CompletionStatus }>(
    `/api/assignments/${assignmentID}/completion`, "PATCH", { completed }
  );
}
