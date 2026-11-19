// queries/googleSyncModel.js
// UC3 Integrated User Google Calendar, outbound half: turn a CanvasPlus "CalendarEvent"
// row into the body Google's API expects, and decide whether it should be pushed at all.
//
// Pure on purpose. Everything that can be got wrong here (a missing time, an end before
// its start, a title that reads as "(No title)" in someone's real calendar, a push that
// should not have happened) is decided by these functions, so it is unit-tested without
// a database, a Google account, or a network.
//
// Writing to a student's real calendar is never assumed: shouldSync() has to be told
// explicitly that they opted in and that Google is connected.

import { HttpError } from "../errors.js";

/** Google refuses an event longer than this; a mis-typed year is the usual cause. */
export const MAX_EVENT_DAYS = 30;
export const MAX_SUMMARY_CHARS = 1024;

/** What CanvasPlus writes into the event's description so it is recognisable in Google. */
export const SOURCE_NOTE = "Added from CanvasPlus";

/**
 * Whether this event should be copied out to Google.
 *
 * @param {{ syncToGoogle?: boolean }} preferences the student's calendar settings
 * @param {{ connected?: boolean }} google whether a Google account is linked
 * @param {{ googleEventID?: string | null }} [event] the row, when it already exists
 * @returns {boolean} true only when they opted in, Google is connected, and this event
 *   has not already been pushed (which would duplicate it).
 */
export function shouldSync(preferences = {}, google = {}, event = {}) {
  if (!preferences.syncToGoogle) return false;
  if (!google.connected) return false;
  return !event.googleEventID;
}

/** An ISO instant Google accepts, or null when the value is not a usable date. */
function instant(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The Google Calendar event body for one CanvasPlus event.
 *
 * The title a student sees in Google is their own event title when they gave one, and
 * the assignment's title otherwise, because "(No title)" sitting in a real calendar is
 * useless. The description names CanvasPlus so the event is identifiable later, and
 * links back to the assignment on Canvas when there is a link.
 *
 * @param {{ title?: string | null, eventStart?: string | Date | null, eventEnd?: string | Date | null }} event
 *   The times are optional in the type on purpose: rejecting a missing or unusable one
 *   with a clear message is this function's job, not the caller's.
 * @param {{ assignmentTitle?: string | null, htmlURL?: string | null }} [assignment]
 * @throws {HttpError} 400 when the times are missing, unparseable, backwards, or absurd
 */
export function toGoogleEvent(event = {}, assignment = {}) {
  const start = instant(event.eventStart);
  const end = instant(event.eventEnd);
  if (!start || !end) throw new HttpError(400, "An event needs a start and an end before it can go to Google Calendar");
  if (new Date(end) <= new Date(start)) throw new HttpError(400, "The event's end has to be after its start");
  if (new Date(end) - new Date(start) > MAX_EVENT_DAYS * 86400000) {
    throw new HttpError(400, `An event cannot be longer than ${MAX_EVENT_DAYS} days`);
  }

  const title = (event.title ?? "").trim() || (assignment.assignmentTitle ?? "").trim() || "CanvasPlus event";
  const description = [SOURCE_NOTE, assignment.htmlURL ? assignment.htmlURL : null].filter(Boolean).join("\n");

  return {
    summary: title.slice(0, MAX_SUMMARY_CHARS),
    description,
    start: { dateTime: start },
    end: { dateTime: end }
  };
}

/**
 * Which Google calendar to write to. A student's stored default is used when they have
 * one; "primary" is the calendar every Google account has, so it is the safe fallback.
 */
export function targetCalendar(preferences = {}) {
  const chosen = (preferences.defaultCalendar ?? "").trim();
  return chosen || "primary";
}
