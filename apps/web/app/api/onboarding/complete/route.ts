import { api } from "@/lib/server/api";
import { completeOnboarding } from "@canvasplus/database/queries/onboarding";

export const POST = api(async ({ user }) => completeOnboarding(user.id));
