// src/components/analytics/vizTokens.ts
// Colour roles for the analytics charts, from the validated reference palette.
//
// Validated with the dataviz skill's validate_palette.js against THIS app's card
// surfaces (white in light mode, #3a3a3a in dark), not the reference surfaces:
//   - categorical slots 1–6: all hard gates pass in both modes (worst adjacent
//     CVD ΔE 9.1 light / 8.4 dark; normal-vision 19.6 / 19.3). A few slots sit
//     under 3:1 contrast, so every chart ships a legend, tooltip, and table view.
//   - estimate/actual shades: pass the ordinal checks in both modes.
// Never generate or cycle a colour past slot 8: fold into "Other" instead.

export interface VizTheme {
  surface: string;
  inkPrimary: string;
  inkSecondary: string;
  inkMuted: string;
  grid: string;
  axis: string;
  /** Single-series marks (time per course, study hours). */
  accent: string;
  /** Estimated (lighter emphasis) vs. actual (stronger) – one hue, two steps. */
  estimate: string;
  actual: string;
  /** Meter track: a quieter step of the accent ramp. */
  track: string;
  categorical: string[];
  status: { good: string; warning: string; critical: string };
}

const STATUS = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' };

export const LIGHT: VizTheme = {
  surface: '#ffffff',
  inkPrimary: '#0b0b0b',
  inkSecondary: '#52514e',
  inkMuted: '#6f6e69',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  accent: '#2a78d6',
  estimate: '#86b6ef',
  actual: '#256abf',
  track: '#cde2fb',
  categorical: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  status: STATUS,
};

// The app's dark cards are #3a3a3a (lighter than the reference #1a1a19), so the
// muted ink and chrome are stepped up to stay legible on that surface.
export const DARK: VizTheme = {
  surface: '#3a3a3a',
  inkPrimary: '#ffffff',
  inkSecondary: '#d6d5cc',
  inkMuted: '#b0afa8',
  grid: '#4a4a47',
  axis: '#5c5c58',
  accent: '#3987e5',
  estimate: '#2a78d6',
  actual: '#9ec5f4',
  track: '#104281',
  categorical: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  status: STATUS,
};

export const vizTheme = (darkMode: boolean): VizTheme => (darkMode ? DARK : LIGHT);

/**
 * A stable colour per course: the slot follows the course (sorted by code, as
 * the API returns them), never its rank in one chart, so a course keeps its
 * colour when a filter changes what else is on screen.
 */
export function courseColors(courses: { courseCode: string | null; courseName: string }[], theme: VizTheme) {
  const map = new Map<string, string>();
  courses.forEach((c, i) => {
    const key = c.courseCode || c.courseName;
    map.set(key, i < theme.categorical.length ? theme.categorical[i] : theme.inkMuted);
  });
  return map;
}

/** 45 -> "45m", 90 -> "1h 30m". */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

/** "CECS 491B-02" -> "CECS 491B": the section suffix is noise on an axis. */
export function shortCourse(code: string | null, fallback: string): string {
  return code ? code.replace(/-\d+$/, '') : fallback;
}

export const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * Round axis ticks for a minutes scale: 15/30-minute steps for short spans,
 * whole hours beyond. Returns the ticks and the matching domain maximum.
 */
export function minuteTicks(maxMinutes: number, maxSteps = 5): { ticks: number[]; max: number } {
  const steps = [15, 30, 60, 120, 180, 300, 600, 1200];
  // Short charts get fewer steps, or Recharts silently drops ticks that crowd.
  const step = steps.find((s) => maxMinutes / s <= maxSteps) ?? 1200;
  const top = Math.max(step, Math.ceil(maxMinutes / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return { ticks, max: top };
}
