import { api } from "@/lib/server/api";
import { getSummary } from "@canvasplus/database/queries/analytics";

export const GET = api(async ({ user, query }) => getSummary(user.id, { ...query, tz: query.tz }));
