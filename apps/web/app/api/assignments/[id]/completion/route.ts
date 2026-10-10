import { api } from "@/lib/server/api";
import { setAssignmentCompletion } from "@canvasplus/database/queries/assignments";

export const PATCH = api(async ({ user, params, body }) => setAssignmentCompletion(user.id, params.id, body));
