import { api } from "@/lib/server/api";
import { getOnboarding, saveStep, resetOnboarding } from "@canvasplus/database/queries/onboarding";

export const GET = api(async ({ user }) => getOnboarding(user.id));

export const PATCH = api(async ({ user, body }) => saveStep(user.id, body.step, body.status));

export const DELETE = api(async ({ user }) => resetOnboarding(user.id));
