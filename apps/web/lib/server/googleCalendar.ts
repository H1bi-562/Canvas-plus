// Google Calendar import -- read-only, fetched live for the month on screen.
// Better Auth owns the OAuth grant (linkSocial, encrypted tokens, refresh);
// this file only asks it for a valid access token and reads events.

import axios from "axios";
import { auth } from "@canvasplus/auth/server";
import { loadGoogleAccount, deleteGoogleAccount } from "@canvasplus/database/queries/google";

const API = "https://www.googleapis.com/calendar/v3";
const MAX_RANGE_MS = 62 * 24 * 60 * 60 * 1000;

type GoogleCalendar = { id: string; summary?: string; backgroundColor?: string; selected?: boolean; primary?: boolean };
type GoogleTime = { date?: string; dateTime?: string };
type GoogleApiEvent = { id: string; status?: string; summary?: string; location?: string; htmlLink?: string; start?: GoogleTime; end?: GoogleTime };

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });

export const isGoogleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export async function getGoogleStatus(userId: string) {
  return { configured: isGoogleConfigured(), connected: Boolean(await loadGoogleAccount(userId)) };
}

async function accessToken(userId: string) {
  const row = await loadGoogleAccount(userId);
  if (!row) throw httpError("Google Calendar is not connected.", 404);
  try {
    return (await auth.api.getAccessToken({ body: { accountId: row.id, userId } })).accessToken;
  } catch {
    // 409, not 401: the UI treats our 401 as "your CanvasPlus session ended".
    throw httpError("Google access expired. Reconnect Google Calendar in Settings.", 409);
  }
}

function toEvent(event: GoogleApiEvent, calendar: GoogleCalendar) {
  const allDay = Boolean(event.start?.date);
  const start = event.start?.dateTime ?? event.start?.date ?? "";
  return {
    id: `${calendar.id}:${event.id}`,
    calendarName: calendar.summary ?? "Google Calendar",
    color: calendar.backgroundColor ?? "#4285f4",
    title: event.summary || "(No title)",
    start,
    end: event.end?.dateTime ?? event.end?.date ?? start,
    allDay,
    location: event.location ?? null,
    htmlLink: event.htmlLink ?? null
  };
}

export async function listGoogleEvents(userId: string, start?: string, end?: string) {
  const from = new Date(start ?? "");
  const to = new Date(end ?? "");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > MAX_RANGE_MS) {
    throw httpError("start and end must be ISO dates at most 62 days apart.", 400);
  }

  const token = await accessToken(userId);
  const get = async <T>(path: string, params: Record<string, unknown>) => {
    try {
      return (await axios.get<T>(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, params, timeout: 15000 })).data;
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      // 403 also covers a student who unticked the calendar box on Google's consent screen.
      if (status === 401 || status === 403) throw httpError("Google denied calendar access. Reconnect Google Calendar in Settings and allow calendar access.", 409);
      throw httpError(`Could not read Google Calendar${status ? ` (HTTP ${status})` : ""}.`, 502);
    }
  };

  const { items: calendars = [] } = await get<{ items?: GoogleCalendar[] }>("/users/me/calendarList", { minAccessRole: "reader" });
  const lists = await Promise.all(calendars.filter(c => c.selected || c.primary).map(async calendar => {
    // ponytail: no nextPageToken paging; 2500 events per calendar per month is the ceiling.
    const { items = [] } = await get<{ items?: GoogleApiEvent[] }>(`/calendars/${encodeURIComponent(calendar.id)}/events`, {
      timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: true, orderBy: "startTime", maxResults: 2500
    });
    return items.filter(e => e.status !== "cancelled").map(e => toEvent(e, calendar));
  }));
  return lists.flat();
}

/** Revoke at Google (best effort), then drop the local grant either way. */
export async function disconnectGoogle(userId: string) {
  let revokedAtGoogle = false;
  try {
    // Revoking the access token also revokes its refresh token.
    await axios.post("https://oauth2.googleapis.com/revoke", new URLSearchParams({ token: await accessToken(userId) }), { timeout: 15000 });
    revokedAtGoogle = true;
  } catch (err) {
    if ((err as { status?: number }).status === 404) throw err;
    console.error("Google token revoke failed (removing local grant anyway):", (err as Error).message);
  }
  if (!await deleteGoogleAccount(userId)) throw httpError("Google Calendar is not connected.", 404);
  return { message: "Google Calendar disconnected.", revokedAtGoogle };
}
