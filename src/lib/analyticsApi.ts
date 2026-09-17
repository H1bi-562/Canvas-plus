// src/lib/analyticsApi.ts
// UC21 – client for GET /api/analytics/summary (services/analytics.js).

import { apiRequest } from './apiClient';
import type { CompletionStatus } from './assignmentsApi';

export interface AnalyticsSummary {
  range: { from: string; to: string; tz: string; days: number };
  totals: {
    studyMinutes: number;
    sessions: number;
    avgSessionMinutes: number;
    /** Active ÷ wall time, 0–1; null with no sessions. */
    focusRatio: number | null;
    activeDays: number;
  };
  daily: { date: string; minutes: number }[];
  timePerCourse: {
    courseID: string | null;
    courseCode: string | null;
    courseName: string;
    minutes: number;
    sessions: number;
  }[];
  estVsActual: {
    assignmentID: string;
    title: string;
    courseCode: string | null;
    estimatedMinutes: number;
    actualMinutes: number;
    variancePct: number;
    finished: boolean;
  }[];
  /** Actual ÷ estimated over finished work; 1.25 = 25% longer than planned. */
  estimateRatio: number | null;
  completion: {
    onTime: number; late: number; missing: number; overdue: number;
    pending: number; excused: number; total: number;
    onTimeRate: number | null;
  };
  workload: {
    weekStart: string;
    dueCount: number;
    points: number;
    studyMinutes: number;
    dueByCourse: Record<string, number>;
  }[];
  courses: { courseID: string; courseCode: string | null; courseName: string }[];
  streak: { current: number; longest: number };
  atRisk: {
    assignmentID: string;
    title: string;
    courseCode: string | null;
    dueAt: string;
    hoursLeft: number;
    loggedMinutes: number;
    estimatedMinutes: number | null;
  }[];
}

export type { CompletionStatus };

/** The browser's IANA zone, so days and weeks match the student's calendar. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Today (or `offset` days from it) as YYYY-MM-DD in the browser's zone. */
export function localDateKey(offset = 0, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fetchAnalyticsSummary(params: { from: string; to: string; tz?: string }): Promise<AnalyticsSummary> {
  const qs = new URLSearchParams({ from: params.from, to: params.to, tz: params.tz || browserTimeZone() });
  return apiRequest(`/api/analytics/summary?${qs.toString()}`);
}
