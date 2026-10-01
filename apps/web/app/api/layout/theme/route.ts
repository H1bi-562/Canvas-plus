import { api } from "@/lib/server/api";
import { saveTheme } from "@canvasplus/database/queries/dashboardLayout";

export const PUT = api(async ({ user, body }) => saveTheme(user.id, body.theme));
