import { api } from "@/lib/server/api";
import { listSessions } from "@canvasplus/database/queries/sessions";

export const GET = api(async ({ user, query }) => listSessions(user.id, query));
