import { api } from "@/lib/server/api";
import { endSession } from "@canvasplus/database/queries/sessions";

export const PATCH = api(async ({ user, params }) => endSession(user.id, params.id));
