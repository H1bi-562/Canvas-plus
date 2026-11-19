import { api } from "@/lib/server/api";
import { deleteEventAndSync } from "@/lib/server/calendarSync";

// UC3: also removes the event's copy from Google Calendar when it has one.
export const DELETE = api(async ({ user, params }) => deleteEventAndSync(user.id, params.id));
