// src/lib/canvasApi.ts
// Canvas connection + assignment sync (routes/canvas.js).

import { apiRequest } from './apiClient';

export interface CanvasStatus {
  connected: boolean;
  /** Whether the OAuth2 developer key is configured on the server. */
  configured: boolean;
  authType?: 'oauth' | 'pat';
  canvasBaseURL?: string;
  canvasName?: string | null;
  connectedAt?: string;
}

export interface SyncResult {
  courses: number;
  assignments: number;
  created: number;
  updated: number;
  syncedAt: string;
}

export function fetchCanvasStatus(): Promise<CanvasStatus> {
  return apiRequest('/api/canvas/status');
}

/** Verify a personal access token with Canvas and store it server-side. */
export function connectWithToken(token: string): Promise<CanvasStatus> {
  return apiRequest('/api/canvas/token', 'POST', { token });
}

export function syncAssignments(): Promise<SyncResult> {
  return apiRequest('/api/canvas/sync', 'POST');
}

export function disconnectCanvas(): Promise<{ message: string; revokedAtCanvas: boolean }> {
  return apiRequest('/api/canvas/disconnect', 'DELETE');
}
