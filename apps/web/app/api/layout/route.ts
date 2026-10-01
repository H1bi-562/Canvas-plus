import { api } from "@/lib/server/api";
import * as layouts from "@canvasplus/database/queries/dashboardLayout";

export const GET = api(async ({ user }) => layouts.getLayout(user.id));
export const PUT = api(async ({ user, body }) => layouts.saveLayout(user.id, body.layout));
export const DELETE = api(async ({ user }) => layouts.resetLayout(user.id));
