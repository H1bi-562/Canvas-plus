// src/lib/sessionsApi.ts
// UC24 – client for the study session timer endpoints in routes/sessions.js.

import { API_BASE, ApiError, apiRequest } from './apiClient';

// Re-exported so existing imports (LoginPage, StudyTimer) keep working.
export { API_BASE };
export { ApiError as SessionApiError };

export type SessionStatus = 'active' | 'paused' | 'completed';

export interface StudySession {
  id: string;
  userID: string;
  assignmentID: string | null;
  status: SessionStatus;
  startedAt: string;
  pausedAt: string | null;
  resumedAt: string | null;
  endedAt: string | null;
  /** Banked active seconds, excluding any segment still running. */
  durationSeconds: number;
  /** Banked seconds plus the segment still running, as of the server's clock. */
  elapsedSeconds: number;
  assignmentTitle?: string | null;
}

const request = apiRequest;

/** The open session for the signed-in user, or null when no timer is running. */
export function fetchActiveSession(): Promise<{ session: StudySession | null }> {
  return request('/api/sessions/active');
}

export function startSession(assignmentID?: string | null): Promise<StudySession> {
  return request('/api/sessions/start', 'POST', assignmentID ? { assignmentID } : {});
}

export function pauseSession(id: string): Promise<StudySession> {
  return request(`/api/sessions/${id}/pause`, 'PATCH');
}

export function resumeSession(id: string): Promise<StudySession> {
  return request(`/api/sessions/${id}/resume`, 'PATCH');
}

export function endSession(id: string): Promise<StudySession> {
  return request(`/api/sessions/${id}/end`, 'PATCH');
}

export function fetchSessionHistory(assignmentID?: string): Promise<StudySession[]> {
  const qs = assignmentID ? `?assignmentID=${encodeURIComponent(assignmentID)}` : '';
  return request(`/api/sessions${qs}`);
}

/** Seconds -> H:MM:SS, dropping the hours field until it is needed. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
