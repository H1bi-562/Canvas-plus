import { api } from "@/lib/server/api";
import { listAssignments, createAssignment } from "@canvasplus/database/queries/assignments";

export const GET = api(async ({ user, query }) => listAssignments(user.id, query));

export const POST = api(async ({ user, body }) => createAssignment(user.id, body), { status: 201 });
