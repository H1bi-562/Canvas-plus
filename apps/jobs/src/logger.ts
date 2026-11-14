// UC16 – the worker's console log: one JSON object per line, so a job can be followed
// with `grep <job id>` and the lines can be parsed by whatever collects them later.
// The same steps are also stored per job in "JobEvent" (queries/jobs.js); this is the
// view across jobs, in the order the worker actually did things.

type Fields = Record<string, unknown>;

export function formatLog(level: "info" | "error", event: string, fields: Fields = {}, now = new Date()) {
  return JSON.stringify({ time: now.toISOString(), level, source: "jobs", event, ...fields });
}

export const log = {
  info: (event: string, fields?: Fields) => console.log(formatLog("info", event, fields)),
  error: (event: string, fields?: Fields) => console.error(formatLog("error", event, fields))
};
