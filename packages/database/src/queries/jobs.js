// queries/jobs.js
// UC16 Event-Driven Scheduler -- the job queue (Jace Orozco).
//
// Work that should not make a request wait (re-planning a student's calendar after
// Canvas changes, for one) is written here as a "Job" row and picked up by the worker
// in apps/jobs. Postgres is the queue: a claim is one UPDATE over a
// SELECT ... FOR UPDATE SKIP LOCKED, so any number of workers can poll the same table
// and no two of them ever get the same job.
//
// Life of a job:
//   enqueueJob     -> queued
//   claimNextJob   -> running, attempts + 1, leased to one worker for leaseSeconds
//   completeJob    -> completed, with the handler's result
//   failJob        -> queued again after a backoff while attempts are left, else failed
//
// Every one of those steps also writes a "JobEvent" row in the same statement, so the
// trail returned by getJob is exactly what happened, in order -- that trail (plus the
// worker's one-line-per-step console log) is how a stuck or failing job gets traced.
//
// A worker only finishes a job it still holds the lease on (lockedBy = workerID). If it
// stalled past the lease and another worker took the job over, its late completeJob or
// failJob matches nothing and returns null instead of overwriting the newer attempt.

import { pool } from "../client";
import { HttpError } from "../errors.js";

export const JOB_STATUSES = ["queued", "running", "completed", "failed"];
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_LEASE_SECONDS = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ERROR_CHARS = 2000;
const MAX_SCHEDULE_WINDOW_DAYS = 60;
// A student has no reason to have more than a handful of jobs waiting; past this the
// API says 429 rather than letting one account fill the queue for everyone.
export const MAX_OPEN_JOBS_PER_USER = 25;

// -- Job types ---------------------------------------------------------------
// The types a signed-in student may submit, each with a validate() that turns the
// request body into the exact payload stored (unknown keys dropped, values checked).
// apps/jobs/src/handlers.ts must have a handler for every key here; a test holds the
// two lists together.

function scheduleAssignmentsPayload(input = {}) {
  const payload = {};
  for (const key of ["windowStart", "windowEnd"]) {
    if (input[key] === undefined || input[key] === null) continue;
    const date = new Date(input[key]);
    if (typeof input[key] !== "string" || Number.isNaN(date.getTime())) throw new HttpError(400, `${key} must be an ISO date`);
    payload[key] = date.toISOString();
  }
  if (payload.windowStart && payload.windowEnd) {
    const days = (new Date(payload.windowEnd) - new Date(payload.windowStart)) / 86400000;
    if (days <= 0) throw new HttpError(400, "windowEnd must be after windowStart");
    if (days > MAX_SCHEDULE_WINDOW_DAYS) throw new HttpError(400, `The scheduling window is limited to ${MAX_SCHEDULE_WINDOW_DAYS} days`);
  }
  for (const key of ["dailyStartHour", "dailyEndHour"]) {
    if (input[key] === undefined || input[key] === null) continue;
    if (!Number.isInteger(input[key]) || input[key] < 0 || input[key] > 24) throw new HttpError(400, `${key} must be a whole hour from 0 to 24`);
    payload[key] = input[key];
  }
  if ((payload.dailyEndHour ?? 21) <= (payload.dailyStartHour ?? 9)) throw new HttpError(400, "dailyEndHour must be after dailyStartHour");
  return payload;
}

export const JOB_TYPES = {
  // UC8: place the student's estimated, un-scheduled assignments into open calendar time.
  "schedule.assignments": { validate: scheduleAssignmentsPayload }
};

// -- Pure helpers ------------------------------------------------------------

/** Seconds to wait before retrying after a failed attempt: 30s, 1m, 2m, ... capped at 1h. */
export function retryDelaySeconds(attempt) {
  return Math.min(30 * 2 ** Math.max(0, attempt - 1), 3600);
}

/** The job as the API returns it: no lease or dedupe internals. */
export function publicJob(row) {
  return {
    id: row.id, userID: row.userID, type: row.type, payload: row.payload, status: row.status,
    attempts: row.attempts, maxAttempts: row.maxAttempts, runAt: row.runAt,
    result: row.result, lastError: row.lastError,
    createdAt: row.createdAt, startedAt: row.startedAt, finishedAt: row.finishedAt, updatedAt: row.updatedAt
  };
}

const errorText = (error) => String(error?.message ?? error ?? "Unknown error").slice(0, MAX_ERROR_CHARS);

// -- Submitting --------------------------------------------------------------

/**
 * Queue a job for this user. The payload is validated by its type first, so nothing
 * malformed ever reaches a worker.
 *
 * Asking for the same work twice while the first is still open returns that first job
 * with deduplicated: true instead of queueing a copy. By default "the same work" means
 * the same type and payload; pass dedupeKey to choose the grouping (or null to opt out).
 *
 * @param {string} userID
 * @param {string} type a key of JOB_TYPES
 * @param {Record<string, unknown>} [payload]
 * @param {{ runAt?: Date | null, maxAttempts?: number, dedupeKey?: string | null }} [options]
 */
export async function enqueueJob(userID, type, payload = {}, { runAt = null, maxAttempts = DEFAULT_MAX_ATTEMPTS, dedupeKey } = {}) {
  if (typeof type !== "string" || !Object.hasOwn(JOB_TYPES, type)) throw new HttpError(400, "Unknown job type");
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) throw new HttpError(400, "payload must be an object");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) throw new HttpError(400, "maxAttempts must be between 1 and 10");

  const clean = JOB_TYPES[type].validate(payload);
  const key = dedupeKey === undefined ? JSON.stringify(clean) : dedupeKey;

  // Two passes at most: if the open twin finishes between our insert being refused and
  // our reading it, the second pass queues a fresh job.
  for (let pass = 0; pass < 2; pass++) {
    if (key !== null) {
      const twin = await pool.query(
        `SELECT * FROM "Job"
          WHERE "userID" = $1 AND type = $2 AND "dedupeKey" = $3 AND status IN ('queued', 'running')`,
        [userID, type, key]
      );
      if (twin.rows[0]) return { ...publicJob(twin.rows[0]), deduplicated: true };
    }

    const open = await pool.query(
      "SELECT COUNT(*)::int AS count FROM \"Job\" WHERE \"userID\" = $1 AND status IN ('queued', 'running')",
      [userID]
    );
    if (open.rows[0].count >= MAX_OPEN_JOBS_PER_USER) {
      throw new HttpError(429, "Too many jobs are already waiting. Try again once some have finished.");
    }

    const created = await pool.query(
      `WITH created AS (
         INSERT INTO "Job" ("userID", type, payload, "maxAttempts", "runAt", "dedupeKey")
         VALUES ($1, $2, $3, $4, COALESCE($5, NOW()), $6)
         ON CONFLICT ("userID", type, "dedupeKey") WHERE "dedupeKey" IS NOT NULL AND status IN ('queued', 'running')
         DO NOTHING
         RETURNING *
       ), logged AS (
         INSERT INTO "JobEvent" ("jobID", event, message)
         SELECT id, 'queued', 'Queued ' || type FROM created
       )
       SELECT * FROM created`,
      [userID, type, JSON.stringify(clean), maxAttempts, runAt, key]
    );
    if (created.rows[0]) return { ...publicJob(created.rows[0]), deduplicated: false };
  }
  throw new HttpError(503, "Could not queue the job. Try again.");
}

// -- Reading (the "receiving updates" half of the API) -----------------------

/** One of this user's jobs with its event trail, oldest first. 404 for anyone else's. */
export async function getJob(userID, id) {
  if (typeof id !== "string" || !UUID.test(id)) throw new HttpError(404, "Job not found");
  const { rows } = await pool.query("SELECT * FROM \"Job\" WHERE id = $1 AND \"userID\" = $2", [id, userID]);
  if (rows.length === 0) throw new HttpError(404, "Job not found");

  const events = await pool.query(
    `SELECT event, attempt, message, data, at
       FROM "JobEvent"
      WHERE "jobID" = $1
      ORDER BY at, id`,
    [id]
  );
  return { ...publicJob(rows[0]), events: events.rows };
}

/** This user's jobs, newest first. Optional status filter; limit 1-100 (default 20). */
export async function listJobs(userID, { status, limit } = {}) {
  if (status !== undefined && !JOB_STATUSES.includes(status)) throw new HttpError(400, "Unknown job status");
  const max = limit === undefined ? 20 : Number(limit);
  if (!Number.isInteger(max) || max < 1 || max > 100) throw new HttpError(400, "limit must be between 1 and 100");

  const { rows } = await pool.query(
    `SELECT * FROM "Job"
      WHERE "userID" = $1 AND ($2::text IS NULL OR status = $2)
      ORDER BY "createdAt" DESC, id
      LIMIT $3`,
    [userID, status ?? null, max]
  );
  return rows.map(publicJob);
}

// -- Worker side (apps/jobs) -------------------------------------------------

/**
 * Hand the next due job to this worker, or return null when there is nothing to do.
 * Due means queued with runAt reached, or running under a lease that ran out (its
 * worker died mid-job). Oldest runAt first. A dead job that already used its last
 * attempt is marked failed here rather than run again.
 */
export async function claimNextJob(workerID, { leaseSeconds = DEFAULT_LEASE_SECONDS } = {}) {
  await pool.query(
    `WITH dead AS (
       UPDATE "Job"
          SET status = 'failed', "finishedAt" = NOW(), "updatedAt" = NOW(), "lockedBy" = NULL, "lockedUntil" = NULL,
              "lastError" = 'The worker stopped responding and no attempts were left'
        WHERE status = 'running' AND "lockedUntil" < NOW() AND attempts >= "maxAttempts"
        RETURNING id, attempts, "lastError"
     )
     INSERT INTO "JobEvent" ("jobID", event, attempt, message)
     SELECT id, 'failed', attempts, "lastError" FROM dead`
  );

  const { rows } = await pool.query(
    `WITH next AS (
       SELECT id, status AS "previousStatus"
         FROM "Job"
        WHERE (status = 'queued' AND "runAt" <= NOW())
           OR (status = 'running' AND "lockedUntil" < NOW())
        ORDER BY "runAt", "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     ), claimed AS (
       UPDATE "Job" j
          SET status = 'running', attempts = j.attempts + 1, "lockedBy" = $1,
              "lockedUntil" = NOW() + make_interval(secs => $2), "startedAt" = NOW(), "updatedAt" = NOW()
         FROM next
        WHERE j.id = next.id
        RETURNING j.*, next."previousStatus"
     ), logged AS (
       INSERT INTO "JobEvent" ("jobID", event, attempt, message)
       SELECT id, 'started', attempts,
              CASE WHEN "previousStatus" = 'running'
                   THEN 'Taken over by ' || $1 || ' after the previous worker''s lease ran out'
                   ELSE 'Claimed by ' || $1 END
         FROM claimed
     )
     SELECT * FROM claimed`,
    [workerID, leaseSeconds]
  );
  return rows[0] ?? null;
}

/**
 * Record success. Returns the job, or null when this worker no longer holds it.
 * @param {{ id: string }} job
 * @param {string} workerID
 * @param {unknown} [result] stored on the job as JSON
 */
export async function completeJob(job, workerID, result = null) {
  const { rows } = await pool.query(
    `WITH done AS (
       UPDATE "Job"
          SET status = 'completed', result = $3, "lastError" = NULL, "finishedAt" = NOW(), "updatedAt" = NOW(),
              "lockedBy" = NULL, "lockedUntil" = NULL
        WHERE id = $1 AND status = 'running' AND "lockedBy" = $2
        RETURNING *
     ), logged AS (
       INSERT INTO "JobEvent" ("jobID", event, attempt, message)
       SELECT id, 'completed', attempts, 'Completed' FROM done
     )
     SELECT * FROM done`,
    [job.id, workerID, result === null || result === undefined ? null : JSON.stringify(result)]
  );
  return rows[0] ?? null;
}

/**
 * Record a failed attempt. With attempts left the job goes back to queued, due again
 * after retryDelaySeconds; otherwise (or with retry: false, for errors a second try
 * cannot fix) it is failed for good. Returns the job, or null when this worker no
 * longer holds it.
 */
export async function failJob(job, workerID, error, { retry = true } = {}) {
  const willRetry = retry && job.attempts < job.maxAttempts;
  const { rows } = await pool.query(
    `WITH failed AS (
       UPDATE "Job"
          SET status = $4, "lastError" = $3, "updatedAt" = NOW(), "lockedBy" = NULL, "lockedUntil" = NULL,
              "runAt" = CASE WHEN $4 = 'queued' THEN NOW() + make_interval(secs => $5::int) ELSE "runAt" END,
              "finishedAt" = CASE WHEN $4 = 'failed' THEN NOW() ELSE NULL END
        WHERE id = $1 AND status = 'running' AND "lockedBy" = $2
        RETURNING *
     ), logged AS (
       INSERT INTO "JobEvent" ("jobID", event, attempt, message, data)
       SELECT id, $6, attempts, $3, CASE WHEN $4 = 'queued' THEN jsonb_build_object('retryInSeconds', $5::int) END
         FROM failed
     )
     SELECT * FROM failed`,
    [job.id, workerID, errorText(error), willRetry ? "queued" : "failed", retryDelaySeconds(job.attempts), willRetry ? "retry_scheduled" : "failed"]
  );
  return rows[0] ?? null;
}

/**
 * A handler's own line in the job's trail ("placed 3 of 5 assignments").
 * @param {{ id: string, attempts: number }} job
 * @param {string} message
 * @param {Record<string, unknown> | null} [data]
 */
export async function logJobEvent(job, message, data = null) {
  await pool.query(
    "INSERT INTO \"JobEvent\" (\"jobID\", event, attempt, message, data) VALUES ($1, 'log', $2, $3, $4)",
    [job.id, job.attempts, String(message).slice(0, MAX_ERROR_CHARS), data === null ? null : JSON.stringify(data)]
  );
}
