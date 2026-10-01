import { api } from "@/lib/server/api";
import { getStatus } from "@/lib/server/canvasAuth";

export const GET = api(async ({ user }) => getStatus(user.id));
