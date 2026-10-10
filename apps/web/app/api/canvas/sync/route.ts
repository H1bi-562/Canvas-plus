import { api } from "@/lib/server/api";
import { syncAssignments } from "@/lib/server/canvasSync";

export const POST = api(async ({ user }) => syncAssignments(user.id));
