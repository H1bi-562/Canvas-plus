import { api } from "@/lib/server/api";
import { listEvents } from "@canvasplus/database/queries/calendar";
import { createEventAndSync } from "@/lib/server/calendarSync";

export const GET = api(async ({ user, query }) => listEvents(user.id, query));

// UC3: the event is stored here first, then copied to the student's Google Calendar when
// they have opted in. A failed copy still returns 201, with googleError explaining why,
// because the event itself was saved.
export const POST = api(async ({ user, body }) => createEventAndSync(user.id, body), { status: 201 });
