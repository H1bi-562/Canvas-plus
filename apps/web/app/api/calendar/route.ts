import { api } from "@/lib/server/api";
import { listEvents, createEvent } from "@canvasplus/database/queries/calendar";

export const GET = api(async ({ user, query }) => listEvents(user.id, query));

export const POST = api(async ({ user, body }) => createEvent(user.id, body), { status: 201 });
