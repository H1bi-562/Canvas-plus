import { api } from "@/lib/server/api";
import { getValidAccessToken, getStatus } from "@/lib/server/canvasAuth";

export const POST = api(async ({ user }) => { await getValidAccessToken(user.id); return getStatus(user.id); });
