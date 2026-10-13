import { api } from "@/lib/server/api";
import { generateSummary } from "@canvasplus/database/queries/summarize";

// UC13: generate (and store) an AI summary of the assignment's description.
export const POST = api(async ({ user, params }) => generateSummary(user.id, params.id));
