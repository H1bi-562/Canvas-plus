import { api } from "@/lib/server/api";
import { getGoogleStatus, disconnectGoogle } from "@/lib/server/googleCalendar";

export const GET = api(async ({ user }) => getGoogleStatus(user.id));

export const DELETE = api(async ({ user }) => disconnectGoogle(user.id));
