import { api } from "@/lib/server/api";
import { autoScheduleForUser } from "@canvasplus/database/queries/scheduler";

// UC8: place any of the student's un-scheduled, estimated assignments into open
// calendar time and report what got scheduled vs. what didn't. Ported from the
// pre-rewrite routes/scheduler.js Express wrapper to this project's api() helper.
//
// Body (all optional): { windowStart, windowEnd, dailyStartHour, dailyEndHour }
export const POST = api(async ({ user, body }) => {
  const options: Parameters<typeof autoScheduleForUser>[1] = {};
  if (typeof body.windowStart === "string") options.windowStart = new Date(body.windowStart);
  if (typeof body.windowEnd === "string") options.windowEnd = new Date(body.windowEnd);
  if (typeof body.dailyStartHour === "number") options.dailyStartHour = body.dailyStartHour;
  if (typeof body.dailyEndHour === "number") options.dailyEndHour = body.dailyEndHour;

  return autoScheduleForUser(user.id, options);
}, { status: 201 });
