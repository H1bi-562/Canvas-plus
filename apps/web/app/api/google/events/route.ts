import { api } from "@/lib/server/api";
import { listGoogleEvents } from "@/lib/server/googleCalendar";

export const GET = api(async ({ user, query }) => listGoogleEvents(user.id, query.start, query.end));
