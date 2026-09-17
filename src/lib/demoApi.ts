// src/lib/demoApi.ts
// Dev-only demo data (routes/demo.js). The server does not mount these routes in
// production, and the UI only shows the controls in a Vite dev build.

import { apiRequest } from './apiClient';

export interface DemoSeedResult {
  courses: number;
  assignments: number;
  created: number;
  sessions: number;
}

export function loadDemoData(): Promise<DemoSeedResult> {
  return apiRequest('/api/demo', 'POST');
}

export function removeDemoData(): Promise<{ assignments: number; sessions: number }> {
  return apiRequest('/api/demo', 'DELETE');
}
