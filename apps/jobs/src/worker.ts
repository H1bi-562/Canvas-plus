// UC16 – the worker loop: claim a job, run its handler, write the outcome back, repeat.
//
// All queue rules (who may claim what, retries, leases) live in the database package's
// queries/jobs.js. This file is only the process around them, so several copies of it
// can run side by side without knowing about each other.

import { claimNextJob, completeJob, failJob, logJobEvent, DEFAULT_LEASE_SECONDS } from "@canvasplus/database/queries/jobs";
import { handlers as defaultHandlers, type ClaimedJob, type JobHandler } from "./handlers";
import { log } from "./logger";

export interface WorkerOptions {
  /** Unique per process; it is what a lease is held under. */
  workerID: string;
  handlers?: Record<string, JobHandler>;
  leaseSeconds?: number;
  /** How long a handler may run. Defaults to a little under the lease, so the worker reports the failure itself. */
  timeoutMs?: number;
}

/** What happened to the one job a pass picked up; null when the queue was empty. */
export type Outcome = "completed" | "retry" | "failed" | "lost" | null;

class JobTimeout extends Error {}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new JobTimeout(`Handler timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/** A 4xx from the queries layer means the input is wrong; running it again cannot help. */
const isPermanent = (error: unknown) => {
  const status = (error as { status?: number } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500;
};

/** Claim and run at most one job. */
export async function runOnce({ workerID, handlers = defaultHandlers, leaseSeconds = DEFAULT_LEASE_SECONDS, timeoutMs }: WorkerOptions): Promise<Outcome> {
  const job: ClaimedJob | null = await claimNextJob(workerID, { leaseSeconds });
  if (!job) return null;

  const began = Date.now();
  const about = { jobID: job.id, type: job.type, userID: job.userID, attempt: job.attempts, workerID };
  log.info("job.started", about);

  const finish = (outcome: Exclude<Outcome, null>, extra: Record<string, unknown> = {}) => {
    (outcome === "completed" ? log.info : log.error)(`job.${outcome}`, { ...about, durationMs: Date.now() - began, ...extra });
    return outcome;
  };

  try {
    const handler = Object.hasOwn(handlers, job.type) ? handlers[job.type] : null;
    if (!handler) {
      const saved = await failJob(job, workerID, `No handler for job type "${job.type}"`, { retry: false });
      return finish(saved ? "failed" : "lost", { error: "no handler" });
    }

    const context = {
      log: async (message: string, data?: Record<string, unknown>) => {
        log.info("job.log", { ...about, message, ...data });
        await logJobEvent(job, message, data ?? null);
      }
    };
    const result = await withTimeout(handler(job, context), timeoutMs ?? Math.max(1000, (leaseSeconds - 30) * 1000));
    const saved = await completeJob(job, workerID, result ?? null);
    // No row back: the lease ran out mid-run and another worker owns the job now.
    return finish(saved ? "completed" : "lost");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const saved = await failJob(job, workerID, error, { retry: !isPermanent(error) });
    if (!saved) return finish("lost", { error: message });
    return finish(saved.status === "queued" ? "retry" : "failed", { error: message, ...(saved.status === "queued" ? { retryAt: saved.runAt } : {}) });
  }
}

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  if (signal.aborted) return resolve();
  const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
  const timer = setTimeout(done, ms);
  signal.addEventListener("abort", done);
});

/**
 * Run jobs until the signal aborts. While there is work it goes straight from one job to
 * the next; an empty queue (or an unreachable database) waits pollMs before looking again.
 * Aborting lets the job in hand finish first, so a deploy never cuts one off halfway.
 */
export async function runWorker({ pollMs = 2000, signal, ...options }: WorkerOptions & { pollMs?: number; signal: AbortSignal }) {
  log.info("worker.started", { workerID: options.workerID, pollMs });
  while (!signal.aborted) {
    let outcome: Outcome = null;
    try {
      outcome = await runOnce(options);
    } catch (error) {
      log.error("worker.poll_failed", { workerID: options.workerID, error: error instanceof Error ? error.message : String(error) });
    }
    if (outcome === null) await sleep(pollMs, signal);
  }
  log.info("worker.stopped", { workerID: options.workerID });
}
