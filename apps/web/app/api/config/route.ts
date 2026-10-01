import { api } from "@/lib/server/api";
import { getConfig, saveConfig } from "@canvasplus/database/queries/config";

export const GET = api(async ({ user }) => getConfig(user.id));

export const PUT = api(async ({ user, body }) => saveConfig(user.id, body));
