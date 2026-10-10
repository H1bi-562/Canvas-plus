import { api } from "@/lib/server/api";
import { setAssignmentEstimate, suggestAssignmentEstimate } from "@canvasplus/database/queries/assignments";

// UC7: a computed time-to-finish suggestion the UI can offer; the student accepts it.
export const GET = api(async ({ user, params }) => suggestAssignmentEstimate(user.id, params.id));

export const PATCH = api(async ({ user, params, body }) => setAssignmentEstimate(user.id, params.id, body));
