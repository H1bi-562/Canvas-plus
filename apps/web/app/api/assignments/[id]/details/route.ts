import { api } from "@/lib/server/api";
import { saveAssignmentDetails } from "@canvasplus/database/queries/assignments";

export const PUT = api(async ({ user, params, body }) => saveAssignmentDetails(user.id, params.id, body));
