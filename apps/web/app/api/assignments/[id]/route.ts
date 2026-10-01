import { api } from "@/lib/server/api";
import { getAssignment, deleteAssignment } from "@canvasplus/database/queries/assignments";

export const GET = api(async ({ user, params }) => getAssignment(user.id, params.id));

export const DELETE = api(async ({ user, params }) => deleteAssignment(user.id, params.id));
