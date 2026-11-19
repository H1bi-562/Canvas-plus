// UC3 outbound sync: a CanvasPlus event is stored here first, then copied to the
// student's Google Calendar when they have opted in.
//
// The ordering matters and is deliberate. The local write always happens and always
// stands. Google is best effort on top of it: if the push fails, the student still has
// their event in CanvasPlus and gets told that the copy did not reach Google, rather
// than losing the event because an API was down. The same holds for deleting.

import { createEvent, deleteEvent, setEventGoogleID } from "@canvasplus/database/queries/calendar";
import { getConfig } from "@canvasplus/database/queries/config";
import { shouldSync, targetCalendar, toGoogleEvent } from "@canvasplus/database/queries/googleSyncModel";
import { loadGoogleAccount } from "@canvasplus/database/queries/google";
import { createGoogleEvent, deleteGoogleEvent } from "@/lib/server/googleCalendar";

type Preferences = { syncToGoogle?: boolean; defaultCalendar?: string | null };

/** The student's calendar preferences, treating a missing config as "not opted in". */
async function preferences(userId: string): Promise<Preferences> {
  try {
    return await getConfig(userId) as Preferences;
  } catch {
    return { syncToGoogle: false, defaultCalendar: null };
  }
}

const reason = (err: unknown) =>
  err instanceof Error && err.message ? err.message : "Could not add this to Google Calendar.";

/**
 * Store an event, then copy it to Google when the student asked for that.
 *
 * The response says what actually happened: `googleEventID` is set when the copy was
 * made, and `googleError` explains why it was not when a push was attempted and failed.
 * Both absent simply means sync is off or Google is not connected.
 */
export async function createEventAndSync(userId: string, body: Record<string, unknown>) {
  const event = await createEvent(userId, body);

  const prefs = await preferences(userId);
  const connected = Boolean(await loadGoogleAccount(userId));
  if (!shouldSync(prefs, { connected }, event)) return event;

  try {
    const { id: googleEventID, htmlLink } = await createGoogleEvent(
      userId,
      targetCalendar(prefs),
      toGoogleEvent(event, { assignmentTitle: event.assignmentTitle, htmlURL: event.assignmentURL })
    );
    await setEventGoogleID(userId, event.id, googleEventID);
    return { ...event, googleEventID, googleHtmlLink: htmlLink };
  } catch (err) {
    // The event is saved in CanvasPlus. Only the copy failed, and the student is told so.
    console.error("Google Calendar push failed (event kept locally):", (err as Error).message);
    return { ...event, googleEventID: null, googleError: reason(err) };
  }
}

/**
 * Delete an event here, and remove its Google copy if it has one. The local delete is
 * already done by the time Google is called, so a failure there leaves a stray event on
 * the student's Google Calendar and says so, rather than resurrecting the local row.
 */
export async function deleteEventAndSync(userId: string, id: string) {
  const result = await deleteEvent(userId, id);
  if (!result.googleEventID) return result;

  try {
    const prefs = await preferences(userId);
    await deleteGoogleEvent(userId, targetCalendar(prefs), result.googleEventID);
    return { ...result, removedFromGoogle: true };
  } catch (err) {
    console.error("Google Calendar delete failed (event removed locally):", (err as Error).message);
    return { ...result, removedFromGoogle: false, googleError: reason(err) };
  }
}
