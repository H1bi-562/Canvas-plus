// UC16 – what the worker does for each job type. One handler per key of JOB_TYPES in
// @canvasplus/database/queries/jobs (test/handlers.test.ts keeps the two lists equal).
//
// A handler gets the claimed job and a context, and returns the result to store on the
// job. Throwing fails the attempt; the queue decides whether it is retried. Handlers
// have to be safe to run twice, because a retry or a taken-over lease runs them again.

import { autoScheduleForUser } from "@canvasplus/database/queries/scheduler";

export interface ClaimedJob {
  id: string;
  userID: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

export interface JobContext {
  /** Add a line to this job's event trail (and the worker log). */
  log: (message: string, data?: Record<string, unknown>) => Promise<void>;
}

export type JobHandler = (job: ClaimedJob, context: JobContext) => Promise<unknown>;

export const handlers: Record<string, JobHandler> = {
  // UC8: place the student's estimated, un-scheduled assignments into open calendar time.
  // Safe to repeat: an assignment that already has a calendar block is skipped.
  "schedule.assignments": async (job, { log }) => {
    const { windowStart, windowEnd, dailyStartHour, dailyEndHour } = job.payload as {
      windowStart?: string; windowEnd?: string; dailyStartHour?: number; dailyEndHour?: number;
    };
    const { scheduled, unscheduled } = await autoScheduleForUser(job.userID, {
      ...(windowStart ? { windowStart: new Date(windowStart) } : {}),
      ...(windowEnd ? { windowEnd: new Date(windowEnd) } : {}),
      ...(dailyStartHour !== undefined ? { dailyStartHour } : {}),
      ...(dailyEndHour !== undefined ? { dailyEndHour } : {})
    });
    await log(`Scheduled ${scheduled.length}, left ${unscheduled.length} unscheduled`, { scheduled: scheduled.length, unscheduled: unscheduled.length });
    return {
      scheduled: scheduled.map((event) => ({ assignmentID: event.assignmentID, eventStart: event.eventStart, eventEnd: event.eventEnd })),
      unscheduled
    };
  }
};
