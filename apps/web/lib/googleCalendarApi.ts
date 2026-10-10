// Google Calendar import (read-only) and the calendar's show/hide preferences.

import { authClient } from "@canvasplus/auth/client";
import { apiRequest } from "@/lib/apiClient";

export interface GoogleEvent {
  id: string;
  calendarName: string;
  color: string;
  title: string;
  /** RFC 3339 date-time, or YYYY-MM-DD for all-day events. */
  start: string;
  /** Exclusive end; for all-day events the day after the last day. */
  end: string;
  allDay: boolean;
  location: string | null;
  htmlLink: string | null;
}

export interface GoogleStatus {
  /** Whether the server has Google OAuth credentials. */
  configured: boolean;
  connected: boolean;
}

export type CalendarSource = "canvas" | "google";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export function fetchGoogleStatus() {
  return apiRequest<GoogleStatus>("/api/google");
}

export function fetchGoogleEvents(start: Date, end: Date) {
  const query = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
  return apiRequest<GoogleEvent[]>(`/api/google/events?${query}`);
}

export function disconnectGoogle() {
  return apiRequest<{ message: string; revokedAtGoogle: boolean }>("/api/google", "DELETE");
}

/** Leaves the page for Google's consent screen; comes back to /settings?google=connected|error. */
export async function connectGoogle() {
  const result = await authClient.linkSocial({
    provider: "google",
    scopes: [GOOGLE_CALENDAR_SCOPE],
    callbackURL: "/settings?google=connected",
    errorCallbackURL: "/settings?google=error"
  });
  if (result.error) throw new Error(result.error.message || "Could not start the Google connection.");
}

/** Hidden sources live in CalendarConfig.filteredEvents, so they follow the account. */
export async function fetchHiddenSources(): Promise<CalendarSource[]> {
  const { filteredEvents } = await apiRequest<{ filteredEvents: unknown }>("/api/config");
  return Array.isArray(filteredEvents) ? filteredEvents.filter((s): s is CalendarSource => s === "canvas" || s === "google") : [];
}

export function saveHiddenSources(hidden: CalendarSource[]) {
  return apiRequest("/api/config", "PUT", { filteredEvents: hidden });
}

/** "9:30 AM" in the viewer's locale. */
export const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** All-day dates are local calendar days; `new Date("YYYY-MM-DD")` would be UTC midnight. */
const toTime = (value: string, allDay: boolean) => new Date(allDay ? `${value}T00:00:00` : value).getTime();

/** Events overlapping the local day containing `day`. Multi-day events appear on every day they cover. */
export function eventsOnDay(events: GoogleEvent[], day: Date): GoogleEvent[] {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  return events.filter(event => {
    const start = toTime(event.start, event.allDay);
    // A zero-length event (start === end) still belongs to its start day.
    const end = Math.max(toTime(event.end, event.allDay), start + 1);
    return start < dayEnd && end > dayStart;
  });
}

const MIN_EVENT_MINUTES = 15;

/**
 * Timed events on `day` for the week grid: minutes from midnight, clipped to the day,
 * with overlapping events put side by side in lanes.
 */
export function timedLayout(events: GoogleEvent[], day: Date) {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  const placed = eventsOnDay(events.filter(e => !e.allDay), day).map(event => {
    const start = Math.max(new Date(event.start).getTime(), dayStart);
    const end = Math.min(Math.max(new Date(event.end).getTime(), start), dayEnd);
    return { event, top: (start - dayStart) / 60000, minutes: Math.max((end - start) / 60000, MIN_EVENT_MINUTES), lane: 0 };
  }).sort((a, b) => a.top - b.top || b.minutes - a.minutes);

  const laneEnds: number[] = [];
  for (const item of placed) {
    item.lane = laneEnds.findIndex(end => end <= item.top);
    if (item.lane === -1) item.lane = laneEnds.push(0) - 1;
    laneEnds[item.lane] = item.top + item.minutes;
  }
  // ponytail: lanes are counted per day, so one overlap narrows every event that day; split into overlap clusters if that looks cramped.
  return placed.map(item => ({ ...item, lanes: laneEnds.length }));
}
