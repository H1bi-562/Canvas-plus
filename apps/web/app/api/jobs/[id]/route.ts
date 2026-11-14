import { api } from "@/lib/server/api";
import { getJob } from "@canvasplus/database/queries/jobs";

// UC16: one job's current status, result or error, and its event trail. Poll it after
// POST /api/jobs until status is "completed" or "failed".
export const GET = api(async ({ user, params }) => getJob(user.id, params.id));
