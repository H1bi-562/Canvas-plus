import { api } from "@/lib/server/api";
import { deleteEvent } from "@canvasplus/database/queries/calendar";

export const DELETE = api(async ({ user, params }) => deleteEvent(user.id, params.id));
