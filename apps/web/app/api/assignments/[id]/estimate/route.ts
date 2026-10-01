import { api } from "@/lib/server/api";
import { setAssignmentEstimate } from "@canvasplus/database/queries/assignments";

export const PATCH = api(async ({ user, params, body }) => setAssignmentEstimate(user.id, params.id, body));
