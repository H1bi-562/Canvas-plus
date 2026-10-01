import { api } from "@/lib/server/api";
import { resumeSession } from "@canvasplus/database/queries/sessions";

export const PATCH = api(async ({ user, params }) => resumeSession(user.id, params.id));
