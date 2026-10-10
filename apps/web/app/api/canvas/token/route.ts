import { api } from "@/lib/server/api";
import { connectWithToken } from "@/lib/server/canvasAuth";

export const POST = api(async ({ user, body }) => connectWithToken(user.id, body.token));
