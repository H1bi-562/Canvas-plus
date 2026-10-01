import { api } from "@/lib/server/api";
import { pauseSession } from "@canvasplus/database/queries/sessions";

export const PATCH = api(async ({ user, params }) => pauseSession(user.id, params.id));
