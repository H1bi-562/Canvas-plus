import { api } from "@/lib/server/api";
import { enqueueJob, listJobs } from "@canvasplus/database/queries/jobs";

// UC16: hand work to the job queue instead of doing it inside the request.
// Body: { type, payload? } -- the type picks the handler in apps/jobs, and the payload is
// checked against that type before anything is queued. Answers 202 (accepted, not done yet);
// GET /api/jobs/:id is where the outcome arrives.
export const POST = api(async ({ user, body }) => enqueueJob(user.id, body.type as string, (body.payload ?? {}) as Record<string, unknown>), { status: 202 });

// The student's own jobs, newest first. Query: status (queued | running | completed | failed), limit (1-100).
export const GET = api(async ({ user, query }) => listJobs(user.id, { status: query.status, limit: query.limit }));
