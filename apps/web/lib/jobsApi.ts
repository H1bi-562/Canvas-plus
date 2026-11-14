// UC16 – client for the job queue endpoints in app/api/jobs.

import { ApiError, apiRequest } from "@/lib/apiClient";

export type JobStatus = "queued" | "running" | "completed" | "failed";

/** Job types a student can submit, with the payload each accepts. */
export interface JobPayloads {
  "schedule.assignments": { windowStart?: string; windowEnd?: string; dailyStartHour?: number; dailyEndHour?: number };
}
export type JobType = keyof JobPayloads;

export interface Job<Result = unknown> {
  id: string;
  userID: string;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  /** When a worker may next pick it up; in the future while a retry is backing off. */
  runAt: string;
  result: Result | null;
  lastError: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
}

export interface JobEvent {
  event: "queued" | "started" | "log" | "retry_scheduled" | "completed" | "failed";
  attempt: number;
  message: string | null;
  data: Record<string, unknown> | null;
  at: string;
}

export type JobWithEvents<Result = unknown> = Job<Result> & { events: JobEvent[] };

/** deduplicated: true means the same request was already waiting, and this is that job. */
export function submitJob<T extends JobType>(type: T, payload: JobPayloads[T] = {}): Promise<Job & { deduplicated: boolean }> {
  return apiRequest("/api/jobs", "POST", { type, payload });
}

export function fetchJob<Result = unknown>(id: string): Promise<JobWithEvents<Result>> {
  return apiRequest(`/api/jobs/${id}`);
}

export function fetchJobs(status?: JobStatus): Promise<Job[]> {
  return apiRequest(`/api/jobs${status ? `?status=${status}` : ""}`);
}

const FINISHED: ReadonlySet<JobStatus> = new Set(["completed", "failed"]);

/**
 * Poll a job until it is completed or failed and resolve with it either way (a failed
 * job is a result to show, not an exception). Rejects only if the job cannot be read or
 * is still not finished after timeoutMs. onUpdate sees every poll, for progress UI.
 */
export async function waitForJob<Result = unknown>(
  id: string,
  { intervalMs = 1000, timeoutMs = 60000, onUpdate }: { intervalMs?: number; timeoutMs?: number; onUpdate?: (job: JobWithEvents<Result>) => void } = {}
): Promise<JobWithEvents<Result>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await fetchJob<Result>(id);
    onUpdate?.(job);
    if (FINISHED.has(job.status)) return job;
    if (Date.now() + intervalMs > deadline) throw new ApiError("This is taking longer than expected. It will keep running in the background.", 0);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
