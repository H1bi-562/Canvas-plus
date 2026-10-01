import { api } from "@/lib/server/api";
import { seedDemoData, clearDemoData } from "@canvasplus/database/queries/demoData";

export const POST = api(async ({ user }) => seedDemoData(user.id), { developmentOnly: true });
export const DELETE = api(async ({ user }) => clearDemoData(user.id), { developmentOnly: true });
