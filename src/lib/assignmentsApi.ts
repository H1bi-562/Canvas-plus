// src/lib/assignmentsApi.ts
// Assignments as the UI shows them. Rows come from GET /api/assignments, which
// returns Canvas-synced and demo assignments in the same shape.

import { apiRequest } from './apiClient';

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
  priorityScore: number | null;
  estimatedMinutes: number | null;
  estimateSource: 'student' | 'ai' | null;
  submittedAt: string | null;
  completedAt: string | null;
  loggedSeconds: number;
  completionStatus: CompletionStatus;
}

/** Computed server-side from Canvas's submission and the student's "Mark done". */
export type CompletionStatus =
  | 'pending' | 'overdue' | 'submitted' | 'done' | 'late' | 'missing' | 'excused';

/** Statuses where the work is handed in (on time or not) or waived. */
export const FINISHED_STATUSES: ReadonlySet<CompletionStatus> =
  new Set(['submitted', 'done', 'late', 'excused']);

export type Priority = 'High' | 'Medium' | 'Low';

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
  points: number | null;
  courseID: string;
  courseName: string;
  courseCode: string | null;
  htmlURL: string | null;
  isDemo: boolean;
  estimatedMinutes: number | null;
  estimateSource: 'student' | 'ai' | null;
  /** Active minutes from finished study sessions on this assignment. */
  loggedMinutes: number;
  completionStatus: CompletionStatus;
  submittedAt: string | null;
  completedAt: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Canvas descriptions are HTML; the cards show plain text. */
function toPlainText(html: string | null): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function localDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The AI priority score (UC10) wins when it exists. Until then, urgency is the
 * best signal we have: due (or overdue) within 2 days is High, within a week Medium.
 */
function priorityFor(row: AssignmentRow, now: number): Priority {
  // Finished work needs no attention, whatever its due date says.
  if (FINISHED_STATUSES.has(row.completionStatus)) return 'Low';
  if (row.priorityScore != null) {
    if (row.priorityScore >= 70) return 'High';
    if (row.priorityScore >= 40) return 'Medium';
    return 'Low';
  }
  if (!row.dueAt) return 'Low';
  const daysLeft = (new Date(row.dueAt).getTime() - now) / DAY_MS;
  if (daysLeft <= 2) return 'High';
  if (daysLeft <= 7) return 'Medium';
  return 'Low';
}

function dueLabelFor(dueAt: string | null, now: number): string {
  if (!dueAt) return 'No due date';
  const due = new Date(dueAt);
  const label = due.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  return due.getTime() < now ? `Overdue · ${label}` : label;
}

export function toAssignment(row: AssignmentRow, now: number = Date.now()): Assignment {
  return {
    id: row.id,
    title: row.title,
    description: toPlainText(row.description),
    dueDate: row.dueAt ? localDateKey(new Date(row.dueAt)) : '',
    dueLabel: dueLabelFor(row.dueAt, now),
    dueAt: row.dueAt,
    priority: priorityFor(row, now),
    points: row.points,
    courseID: row.courseID,
    courseName: row.courseName,
    courseCode: row.courseCode,
    htmlURL: row.htmlURL,
    isDemo: Boolean(row.isDemo),
    estimatedMinutes: row.estimatedMinutes,
    estimateSource: row.estimateSource,
    loggedMinutes: Math.round((row.loggedSeconds || 0) / 60),
    completionStatus: row.completionStatus || 'pending',
    submittedAt: row.submittedAt,
    completedAt: row.completedAt,
  };
}

export async function fetchAssignments(): Promise<Assignment[]> {
  const rows = await apiRequest<AssignmentRow[]>('/api/assignments');
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

/** Save the student's estimate in whole minutes, or clear it with null. */
export function saveEstimate(assignmentID: string, minutes: number | null) {
  return apiRequest<{ assignmentID: string; estimatedMinutes: number | null }>(
    `/api/assignments/${assignmentID}/estimate`, 'PATCH', { minutes }
  );
}

/** "Mark done" (true) or undo it (false). Canvas sync never overwrites this. */
export function saveCompleted(assignmentID: string, completed: boolean) {
  return apiRequest<{ assignmentID: string; completedAt: string | null; completionStatus: CompletionStatus }>(
    `/api/assignments/${assignmentID}/completion`, 'PATCH', { completed }
  );
}
