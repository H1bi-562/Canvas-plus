import { api } from "@/lib/server/api";
import { startSession } from "@canvasplus/database/queries/sessions";

export const POST = api(async ({ user, body }) => startSession(user.id, body), { status: 201 });
