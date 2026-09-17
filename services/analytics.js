// services/analytics.js
// UC21 Study Analytics -- everything the Analytics view shows, computed for one
// student over a date range in that student's time zone.
//
// Two queries fetch the student's completed sessions and assignments; the
// aggregation happens here in JS. Per-student volumes are small (hundreds of
// rows a semester), and doing it in code keeps every rule -- which day a late
// session belongs to, what counts as on time -- in one readable, testable place.
//
// Time zones: a session at 11:30 PM in Long Beach is that day, not the next UTC
// day. Range boundaries are resolved by Postgres (AT TIME ZONE), and every
// per-day or per-week bucket uses the student's IANA zone via Intl.

const pool = require('../db');
const { completionStatus } = require('./assignmentProgress');

class AnalyticsError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'AnalyticsError';
    this.status = status;
  }
}

const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;
const AT_RISK_HOURS = 72;
// "Barely started": less than a quarter of the estimate logged.
const AT_RISK_PROGRESS = 0.25;
const EST_VS_ACTUAL_LIMIT = 8;

const HOUR_MS = 60 * 60 * 1000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

// Statuses where the work is handed in (on time or not) or waived.
const FINISHED = new Set(['submitted', 'done', 'late', 'excused']);

// ── Date helpers (exported for tests) ─────────────────────────────────────

const formatters = new Map();

/** The calendar date (YYYY-MM-DD) of an instant in an IANA time zone. */
function localDateKey(instant, tz) {
  let fmt = formatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(tz, fmt);
  }
  const parts = Object.fromEntries(fmt.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Calendar arithmetic on YYYY-MM-DD keys. Done in UTC so DST never skips a day. */
function addDays(key, days) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Monday on or before a date key. */
function weekStartKey(key) {
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(key, -((dow + 6) % 7));
}

/** A real calendar date in YYYY-MM-DD form (rejects 2026-09-31). */
function isValidDateKey(key) {
  if (typeof key !== 'string' || !DATE_KEY.test(key)) return false;
  const d = new Date(`${key}T00:00:00Z`);
  // Month 13 is an Invalid Date; day 31 of September rolls into October.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key;
}

function daysBetweenInclusive(from, to) {
  return Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000) + 1;
}

function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const round1 = (n) => Math.round(n * 10) / 10;
const round3 = (n) => Math.round(n * 1000) / 1000;
const toMinutes = (seconds) => Math.round(seconds / 60);

// ── Input ─────────────────────────────────────────────────────────────────

function resolveRange({ from, to, tz, now }) {
  if (!isValidTimeZone(tz)) {
    throw new AnalyticsError('tz must be an IANA time zone such as America/Los_Angeles.', 400);
  }
  const today = localDateKey(now, tz);
  const end   = to ?? today;
  const start = from ?? addDays(end, -(DEFAULT_RANGE_DAYS - 1));

  if (!isValidDateKey(start) || !isValidDateKey(end)) {
    throw new AnalyticsError('from and to must be dates in YYYY-MM-DD form.', 400);
  }
  if (start > end) {
    throw new AnalyticsError('from must be on or before to.', 400);
  }
  const days = daysBetweenInclusive(start, end);
  if (days > MAX_RANGE_DAYS) {
    throw new AnalyticsError(`A range can cover at most ${MAX_RANGE_DAYS} days.`, 400);
  }
  return { from: start, to: end, tz, days };
}

// ── Queries ───────────────────────────────────────────────────────────────

async function loadBoundaries(range) {
  // Local midnight at the start of `from` and after `to`, as absolute instants.
  const { rows: [row] } = await pool.query(
    `SELECT ($1::date::timestamp AT TIME ZONE $3)       AS "startAt",
            (($2::date + 1)::timestamp AT TIME ZONE $3) AS "endAt"`,
    [range.from, range.to, range.tz]
  );
  return { startAt: row.startAt.getTime(), endAt: row.endAt.getTime() };
}

/** Every completed session, with the course it counts toward (if any). */
async function loadSessions(userID) {
  const { rows } = await pool.query(
    `SELECT s."assignmentID", s."startedAt", s."endedAt", s."durationSeconds",
            c.id AS "courseID", c."courseCode", c.name AS "courseName"
       FROM "StudySession" s
       LEFT JOIN "Assignment" a ON a.id = s."assignmentID" AND a."userID" = s."userID"
       LEFT JOIN "Course" c     ON c.id = a."courseID"
      WHERE s."userID" = $1 AND s.status = 'completed'`,
    [userID]
  );
  return rows;
}

async function loadAssignments(userID) {
  const { rows } = await pool.query(
    `SELECT a.id, a.title, a.points, a."dueAt", a."submittedAt", a."submissionState",
            a.late, a.missing, a.excused, a."completedAt",
            c.id AS "courseID", c."courseCode", c.name AS "courseName",
            ad."estimatedMinutes", ad."estimateSource"
       FROM "Assignment" a
       JOIN "Course" c ON c.id = a."courseID"
       LEFT JOIN "AssignmentDetail" ad ON ad."assignmentID" = a.id
      WHERE a."userID" = $1`,
    [userID]
  );
  return rows;
}

// ── Aggregations ──────────────────────────────────────────────────────────

function computeTotals(sessions) {
  let active = 0;
  let wall = 0;
  const days = new Set();
  for (const s of sessions) {
    active += s.durationSeconds;
    // Guard against clock skew: wall time can never be less than active time.
    wall += Math.max(s.durationSeconds, (new Date(s.endedAt) - new Date(s.startedAt)) / 1000);
    days.add(s.dayKey);
  }
  return {
    studyMinutes: toMinutes(active),
    sessions: sessions.length,
    avgSessionMinutes: sessions.length ? round1(active / 60 / sessions.length) : 0,
    // Share of session time spent actually studying rather than paused.
    focusRatio: wall > 0 ? round3(active / wall) : null,
    activeDays: days.size,
  };
}

function computeDaily(sessions, range) {
  const seconds = new Map();
  for (const s of sessions) seconds.set(s.dayKey, (seconds.get(s.dayKey) || 0) + s.durationSeconds);
  const daily = [];
  for (let key = range.from; key <= range.to; key = addDays(key, 1)) {
    daily.push({ date: key, minutes: toMinutes(seconds.get(key) || 0) });
  }
  return daily;
}

function computeTimePerCourse(sessions) {
  const buckets = new Map();
  for (const s of sessions) {
    const id = s.courseID || null;
    const bucket = buckets.get(id) || {
      courseID: id,
      courseCode: id ? s.courseCode : null,
      courseName: id ? s.courseName : 'General study',
      seconds: 0,
      sessions: 0,
    };
    bucket.seconds += s.durationSeconds;
    bucket.sessions += 1;
    buckets.set(id, bucket);
  }
  return [...buckets.values()]
    .sort((a, b) => b.seconds - a.seconds)
    .map(({ seconds, ...rest }) => ({ ...rest, minutes: toMinutes(seconds) }));
}

function computeEstVsActual(assignments, actualSecondsByAssignment, inRangeAssignmentIDs, boundaries) {
  const rows = assignments
    .filter((a) => a.estimatedMinutes != null && (actualSecondsByAssignment.get(a.id) || 0) > 0)
    .filter((a) => {
      const due = a.dueAt ? new Date(a.dueAt).getTime() : null;
      const dueInRange = due !== null && due >= boundaries.startAt && due < boundaries.endAt;
      return dueInRange || inRangeAssignmentIDs.has(a.id);
    })
    .sort((a, b) => (a.dueAt ? new Date(a.dueAt) : Infinity) - (b.dueAt ? new Date(b.dueAt) : Infinity))
    .map((a) => {
      const actualMinutes = toMinutes(actualSecondsByAssignment.get(a.id));
      return {
        assignmentID: a.id,
        title: a.title,
        courseCode: a.courseCode,
        estimatedMinutes: a.estimatedMinutes,
        actualMinutes,
        variancePct: Math.round(((actualMinutes - a.estimatedMinutes) / a.estimatedMinutes) * 100),
        finished: FINISHED.has(a.status),
      };
    });

  // How long finished work really takes relative to the guess: 1.25 = 25% longer.
  const finished = rows.filter((r) => r.finished);
  const est = finished.reduce((n, r) => n + r.estimatedMinutes, 0);
  const act = finished.reduce((n, r) => n + r.actualMinutes, 0);

  return {
    estVsActual: rows.slice(-EST_VS_ACTUAL_LIMIT),
    estimateRatio: est > 0 ? round3(act / est) : null,
  };
}

function computeCompletion(assignments, boundaries) {
  const counts = { onTime: 0, late: 0, missing: 0, overdue: 0, pending: 0, excused: 0 };
  for (const a of assignments) {
    const due = a.dueAt ? new Date(a.dueAt).getTime() : null;
    if (due === null || due < boundaries.startAt || due >= boundaries.endAt) continue;
    switch (a.status) {
      case 'submitted':
      case 'done':    counts.onTime += 1; break;
      case 'late':    counts.late += 1; break;
      case 'missing': counts.missing += 1; break;
      case 'overdue': counts.overdue += 1; break;
      case 'excused': counts.excused += 1; break;
      default:        counts.pending += 1;
    }
  }
  const total = Object.values(counts).reduce((n, v) => n + v, 0);
  // Only work whose outcome is decided: not-yet-due and excused are left out.
  const decided = counts.onTime + counts.late + counts.missing + counts.overdue;
  return { ...counts, total, onTimeRate: decided > 0 ? round3(counts.onTime / decided) : null };
}

function computeWorkload(assignments, sessions, range) {
  const weeks = [];
  for (let wk = weekStartKey(range.from); wk <= weekStartKey(range.to); wk = addDays(wk, 7)) {
    weeks.push({ weekStart: wk, dueCount: 0, points: 0, studySeconds: 0, dueByCourse: {} });
  }
  const find = (key) => weeks.find((w) => key >= w.weekStart && key < addDays(w.weekStart, 7));

  for (const a of assignments) {
    if (!a.dueAt) continue;
    const week = find(a.dueKey);
    if (!week) continue;
    week.dueCount += 1;
    week.points += a.points || 0;
    const code = a.courseCode || a.courseName;
    week.dueByCourse[code] = (week.dueByCourse[code] || 0) + 1;
  }
  for (const s of sessions) {
    const week = find(s.dayKey);
    if (week) week.studySeconds += s.durationSeconds;
  }

  return weeks.map(({ studySeconds, ...w }) => ({ ...w, studyMinutes: toMinutes(studySeconds) }));
}

/** Consecutive local days with at least one completed session. */
function computeStreak(allSessions, today) {
  const days = [...new Set(allSessions.map((s) => s.dayKey))].sort();
  let longest = 0;
  let run = 0;
  for (let i = 0; i < days.length; i += 1) {
    run = i > 0 && addDays(days[i - 1], 1) === days[i] ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  // A streak is still alive if the last study day was today or yesterday.
  const studied = new Set(days);
  let cursor = studied.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (studied.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, longest };
}

function computeAtRisk(assignments, actualSecondsByAssignment, now) {
  const horizon = now + AT_RISK_HOURS * HOUR_MS;
  return assignments
    .filter((a) => {
      if (!a.dueAt || FINISHED.has(a.status)) return false;
      const due = new Date(a.dueAt).getTime();
      if (due <= now || due > horizon) return false;
      const logged = (actualSecondsByAssignment.get(a.id) || 0) / 60;
      return a.estimatedMinutes != null
        ? logged < a.estimatedMinutes * AT_RISK_PROGRESS
        : logged === 0;
    })
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    .map((a) => ({
      assignmentID: a.id,
      title: a.title,
      courseCode: a.courseCode,
      dueAt: a.dueAt,
      hoursLeft: Math.round((new Date(a.dueAt).getTime() - now) / HOUR_MS),
      loggedMinutes: toMinutes(actualSecondsByAssignment.get(a.id) || 0),
      estimatedMinutes: a.estimatedMinutes,
    }));
}

// ── Entry point ───────────────────────────────────────────────────────────

/**
 * @param {string} userID
 * @param {{from?: string, to?: string, tz: string, now?: Date|number}} options
 *   from/to are inclusive local dates (YYYY-MM-DD); default is the last 30 days.
 *   now is injectable for tests.
 */
async function getSummary(userID, { from, to, tz, now = Date.now() } = {}) {
  const nowMs = new Date(now).getTime();
  const range = resolveRange({ from: from || undefined, to: to || undefined, tz, now: nowMs });
  const boundaries = await loadBoundaries(range);

  const [rawSessions, rawAssignments] = await Promise.all([loadSessions(userID), loadAssignments(userID)]);

  const allSessions = rawSessions.map((s) => ({ ...s, dayKey: localDateKey(s.startedAt, tz) }));
  const inRange = allSessions.filter((s) => {
    const t = new Date(s.startedAt).getTime();
    return t >= boundaries.startAt && t < boundaries.endAt;
  });

  const assignments = rawAssignments.map((a) => ({
    ...a,
    status: completionStatus(a, nowMs),
    dueKey: a.dueAt ? localDateKey(a.dueAt, tz) : null,
  }));

  // All-time active seconds per assignment: an estimate covers the whole job,
  // not just the slice of it that fell inside the chart's date range.
  const actualSecondsByAssignment = new Map();
  for (const s of allSessions) {
    if (!s.assignmentID) continue;
    actualSecondsByAssignment.set(s.assignmentID, (actualSecondsByAssignment.get(s.assignmentID) || 0) + s.durationSeconds);
  }
  const inRangeAssignmentIDs = new Set(inRange.map((s) => s.assignmentID).filter(Boolean));

  const workload = computeWorkload(assignments, inRange, range);

  // Every course that appears in this summary, so the UI can give each one a
  // stable colour across charts.
  const workloadKeys = new Set(workload.flatMap((w) => Object.keys(w.dueByCourse)));
  const courseByID = new Map();
  for (const x of [...inRange, ...assignments]) {
    if (!x.courseID) continue;
    const studied = inRange.some((s) => s.courseID === x.courseID);
    if (studied || workloadKeys.has(x.courseCode || x.courseName)) {
      courseByID.set(x.courseID, { courseID: x.courseID, courseCode: x.courseCode, courseName: x.courseName });
    }
  }
  const label = (c) => String(c.courseCode || c.courseName);
  const courses = [...courseByID.values()].sort((a, b) => label(a).localeCompare(label(b)));

  return {
    range,
    totals: computeTotals(inRange),
    daily: computeDaily(inRange, range),
    timePerCourse: computeTimePerCourse(inRange),
    ...computeEstVsActual(assignments, actualSecondsByAssignment, inRangeAssignmentIDs, boundaries),
    completion: computeCompletion(assignments, boundaries),
    workload,
    courses,
    streak: computeStreak(allSessions, localDateKey(nowMs, tz)),
    atRisk: computeAtRisk(assignments, actualSecondsByAssignment, nowMs),
  };
}

module.exports = {
  AnalyticsError,
  getSummary,
  localDateKey,
  weekStartKey,
  addDays,
  isValidDateKey,
};
