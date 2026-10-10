import { api } from "@/lib/server/api";
import { activeSession } from "@canvasplus/database/queries/sessions";

export const GET = api(async ({ user }) => activeSession(user.id));
