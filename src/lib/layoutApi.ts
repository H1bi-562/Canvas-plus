// src/lib/layoutApi.ts
// UC22 – client for /api/layout (services/dashboardLayout.js).

import { apiRequest } from './apiClient';
import type { ThemeId } from './themes';

/** One widget's place on the 12-column home grid (react-grid-layout's shape). */
export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutResponse {
  layout: LayoutItem[];
  /** True when the student has never saved a layout (or reset it). */
  isDefault: boolean;
  theme: ThemeId;
  updatedAt: string | null;
}

export function fetchLayout(): Promise<LayoutResponse> {
  return apiRequest('/api/layout');
}

export function saveLayout(layout: LayoutItem[]): Promise<LayoutResponse> {
  // Send only the grid fields; react-grid-layout adds moved/static/minW etc.
  const clean = layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
  return apiRequest('/api/layout', 'PUT', { layout: clean });
}

export function resetLayout(): Promise<LayoutResponse> {
  return apiRequest('/api/layout', 'DELETE');
}

/** Themes apply the moment they are picked, so they save on their own. */
export function saveTheme(theme: ThemeId): Promise<LayoutResponse> {
  return apiRequest('/api/layout/theme', 'PUT', { theme });
}
