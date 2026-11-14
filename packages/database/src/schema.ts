import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, boolean, integer, doublePrecision, jsonb, uniqueIndex, index, check } from "drizzle-orm/pg-core";

const id = () => uuid("id").defaultRandom().primaryKey();
const time = (name: string) => timestamp(name, { withTimezone: true });
const timestamps = () => ({ createdAt: time("createdAt").defaultNow().notNull(), updatedAt: time("updatedAt").defaultNow().notNull() });

export const user = pgTable("User", {
  id: id(), name: text("name").notNull().default(""), email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false), image: text("image"), ...timestamps()
});

export const session = pgTable("AuthSession", {
  id: id(), userId: uuid("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(), expiresAt: time("expiresAt").notNull(),
  ipAddress: text("ipAddress"), userAgent: text("userAgent"), ...timestamps()
}, t => [index("auth_session_user").on(t.userId)]);

export const account = pgTable("Account", {
  id: id(), userId: uuid("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  accountId: text("accountId").notNull(), providerId: text("providerId").notNull(),
  accessToken: text("accessToken"), refreshToken: text("refreshToken"), idToken: text("idToken"),
  accessTokenExpiresAt: time("accessTokenExpiresAt"), refreshTokenExpiresAt: time("refreshTokenExpiresAt"),
  scope: text("scope"), password: text("password"), ...timestamps()
}, t => [index("account_user").on(t.userId), uniqueIndex("account_provider").on(t.providerId, t.accountId)]);

export const verification = pgTable("Verification", {
  id: id(), identifier: text("identifier").notNull(), value: text("value").notNull(),
  expiresAt: time("expiresAt").notNull(), ...timestamps()
}, t => [index("verification_identifier").on(t.identifier)]);

export const config = pgTable("Config", {
  id: id(), userID: uuid("userID").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  canvasURL: text("canvasURL"), canvasKey: text("canvasKey"), calendarKey: text("calendarKey"), modelKey: text("modelKey"),
  // UC23: first-run wizard progress. Steps map a step id to "done" | "skipped"; a NULL finish time means the wizard still shows.
  onboardingSteps: jsonb("onboardingSteps").notNull().default({}), onboardingCompletedAt: time("onboardingCompletedAt"), ...timestamps()
});

export const calendarConfig = pgTable("CalendarConfig", {
  id: id(), configID: uuid("configID").notNull().unique().references(() => config.id, { onDelete: "cascade" }),
  defaultCalendar: text("defaultCalendar"), filteredEvents: jsonb("filteredEvents"), ...timestamps()
});

export const course = pgTable("Course", {
  id: id(), name: text("name").notNull(), department: text("department"), semester: text("semester"),
  canvasBaseURL: text("canvasBaseURL"), canvasCourseID: text("canvasCourseID"), courseCode: text("courseCode"),
  // UC14: Canvas's apply_assignment_group_weights; false grades by total points.
  applyGroupWeights: boolean("applyGroupWeights"),
  created_at: time("created_at").defaultNow(), updated_at: time("updated_at").defaultNow()
}, t => [uniqueIndex("ux_course_canvas").on(t.canvasBaseURL, t.canvasCourseID)]);

// UC14: a course's grading categories ("assignment groups" in Canvas) and their weights in percent.
export const assignmentGroup = pgTable("AssignmentGroup", {
  id: id(), courseID: uuid("courseID").notNull().references(() => course.id, { onDelete: "cascade" }),
  canvasGroupID: text("canvasGroupID").notNull(), name: text("name").notNull(), weight: doublePrecision("weight").notNull().default(0)
}, t => [uniqueIndex("ux_assignment_group_canvas").on(t.courseID, t.canvasGroupID)]);

export const assignment = pgTable("Assignment", {
  id: id(), userID: uuid("userID").notNull().references(() => user.id, { onDelete: "cascade" }),
  courseID: uuid("courseID").notNull().references(() => course.id, { onDelete: "cascade" }),
  title: text("title").notNull(), description: text("description"), points: integer("points"),
  dueAt: time("dueAt"), availableUntil: time("availableUntil"), canvasAssignmentID: text("canvasAssignmentID"),
  htmlURL: text("htmlURL"), syncedAt: time("syncedAt"), submittedAt: time("submittedAt"),
  submissionState: text("submissionState"), late: boolean("late"), missing: boolean("missing"),
  excused: boolean("excused"), completedAt: time("completedAt"),
  // UC14: the student's Canvas score and grading category (null when it does not count toward the grade).
  score: doublePrecision("score"), groupID: uuid("groupID").references(() => assignmentGroup.id, { onDelete: "set null" })
}, t => [uniqueIndex("ux_assignment_user_canvas").on(t.userID, t.canvasAssignmentID), index("assignment_course").on(t.courseID), index("assignment_due").on(t.dueAt)]);

// UC10/UC13 -- contentHash/generatedAt/summarySource added by Jace Orozco so AI
// routes can skip re-generating output for content they've already seen.
// contentHash is a hash of the fields that fed the specific AI output being
// cached; a match means the stored value is still correct for the current
// content. Right now the only caller is UC13's generateSummary (summarize.js),
// hashing {title, description} -- NOT a combined hash for summary+subtasks+
// priorityScore together, since those are generated by separate features at
// separate times. If a future feature caches subtasks or priorityScore too,
// it should use its own hash/timestamp pair rather than reusing this one.
export const assignmentDetail = pgTable("AssignmentDetail", {
  id: id(), assignmentID: uuid("assignmentID").notNull().unique().references(() => assignment.id, { onDelete: "cascade" }),
  subtasks: jsonb("subtasks"), summary: text("summary"), priorityScore: integer("priorityScore"),
  estimatedMinutes: integer("estimatedMinutes"), estimateSource: text("estimateSource"),
  contentHash: text("contentHash"), generatedAt: time("generatedAt"), summarySource: text("summarySource")
}, t => [check("estimate_minutes", sql`${t.estimatedMinutes} between 1 and 6000`), check("estimate_source", sql`${t.estimateSource} in ('student', 'ai')`),
  check("summary_source", sql`${t.summarySource} in ('ai', 'extractive', 'extractive-fallback')`),
  index("idx_assignmentdetail_contenthash").on(t.contentHash)]);

export const calendarEvent = pgTable("CalendarEvent", {
  id: id(), assignmentID: uuid("assignmentID").notNull().references(() => assignment.id, { onDelete: "cascade" }),
  title: text("title"), calendar: text("calendar"), eventStart: time("eventStart"), eventEnd: time("eventEnd")
}, t => [index("calendar_assignment").on(t.assignmentID)]);

export const studySession = pgTable("StudySession", {
  id: id(), userID: uuid("userID").notNull().references(() => user.id, { onDelete: "cascade" }),
  assignmentID: uuid("assignmentID").references(() => assignment.id, { onDelete: "set null" }),
  status: text("status").notNull().default("active"), startedAt: time("startedAt").notNull().defaultNow(),
  pausedAt: time("pausedAt"), resumedAt: time("resumedAt"), endedAt: time("endedAt"),
  durationSeconds: integer("durationSeconds").notNull().default(0), ...timestamps()
}, t => [check("study_status", sql`${t.status} in ('active', 'paused', 'completed')`),
  uniqueIndex("idx_studysession_one_open_per_user").on(t.userID).where(sql`${t.status} in ('active', 'paused')`),
  index("study_user").on(t.userID), index("study_assignment").on(t.assignmentID)]);

export const canvasAuth = pgTable("CanvasAuth", {
  id: id(), userID: uuid("userID").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  authType: text("authType").notNull().default("oauth"), canvasBaseURL: text("canvasBaseURL").notNull(),
  canvasUserID: text("canvasUserID"), canvasName: text("canvasName"), accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken"), expiresAt: time("expiresAt"), scope: text("scope"),
  connectedAt: time("connectedAt").notNull().defaultNow(), updatedAt: time("updatedAt").notNull().defaultNow()
}, t => [check("canvas_auth_type", sql`${t.authType} in ('oauth', 'pat')`)]);

export const dashboardLayout = pgTable("DashboardLayout", {
  userID: uuid("userID").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  layout: jsonb("layout"), theme: text("theme"), updatedAt: time("updatedAt").notNull().defaultNow()
}, t => [check("layout_array", sql`jsonb_typeof(${t.layout}) = 'array'`)]);

// UC20 Custom Reward System (Jace Orozco) -- rewards a student writes for themselves
// ("30 minutes of gaming", "boba run") and the history of rolling for them.
//
// Rarity: rarityPercent is the reward's drop chance on a roll it is eligible for.
// Requirements: which finished work may roll it (trigger), and how much of it --
// a study session of at least minStudyMinutes, or an assignment finished on time.
// A reward is switched off with active = false rather than deleted, so its past
// rolls keep pointing at it.
export const reward = pgTable("Reward", {
  id: id(), userID: uuid("userID").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(), description: text("description"),
  rarityPercent: doublePrecision("rarityPercent").notNull(),
  trigger: text("trigger").notNull().default("any"), minStudyMinutes: integer("minStudyMinutes"),
  requireOnTime: boolean("requireOnTime").notNull().default(false),
  active: boolean("active").notNull().default(true), ...timestamps()
}, t => [check("reward_name", sql`length(btrim(${t.name})) between 1 and 80`),
  check("reward_rarity", sql`${t.rarityPercent} > 0 and ${t.rarityPercent} <= 100`),
  check("reward_trigger", sql`${t.trigger} in ('any', 'assignment', 'study_session')`),
  check("reward_min_study", sql`${t.minStudyMinutes} between 1 and 1440`),
  index("reward_user").on(t.userID)]);

// One row per roll. rewardName is NULL when the roll came up empty; otherwise it is
// a copy of the reward's name, so the history still reads correctly after the reward
// is renamed or deleted (deleting it only clears rewardID).
// The two partial unique indexes are the anti-farming rule: an assignment or a study
// session can be rolled for once, however many times it is re-marked done.
export const rewardRoll = pgTable("RewardRoll", {
  id: id(), userID: uuid("userID").notNull().references(() => user.id, { onDelete: "cascade" }),
  rewardID: uuid("rewardID").references(() => reward.id, { onDelete: "set null" }), rewardName: text("rewardName"),
  trigger: text("trigger").notNull(),
  assignmentID: uuid("assignmentID").references(() => assignment.id, { onDelete: "set null" }),
  studySessionID: uuid("studySessionID").references(() => studySession.id, { onDelete: "set null" }),
  rolledAt: time("rolledAt").notNull().defaultNow(), claimedAt: time("claimedAt")
}, t => [check("roll_trigger", sql`${t.trigger} in ('assignment', 'study_session')`),
  check("roll_source", sql`(${t.assignmentID} is null or ${t.trigger} = 'assignment') and (${t.studySessionID} is null or ${t.trigger} = 'study_session')`),
  check("roll_won", sql`${t.rewardID} is null or ${t.rewardName} is not null`),
  uniqueIndex("ux_roll_assignment").on(t.userID, t.assignmentID).where(sql`${t.assignmentID} is not null`),
  uniqueIndex("ux_roll_session").on(t.studySessionID).where(sql`${t.studySessionID} is not null`),
  index("roll_user").on(t.userID, t.rolledAt)]);

// UC16 Event-Driven Scheduler (Jace Orozco) -- the job queue. The web app (and later the
// Canvas sync) adds a row; the worker in apps/jobs claims it, runs it, and writes the
// outcome back. Postgres is the queue, so there is no extra service to run or deploy.
//
// status   queued -> running -> completed | failed. A failed attempt with tries left
//          goes back to queued with runAt pushed into the future (retry backoff).
// lease    lockedBy/lockedUntil mark which worker has a running job and for how long;
//          a job whose lease ran out (the worker died) may be claimed again.
// dedupe   at most one open (queued or running) job per user, type and dedupeKey, so a
//          burst of the same event becomes one job instead of a pile of them.
export const job = pgTable("Job", {
  id: id(), userID: uuid("userID").notNull().references(() => user.id, { onDelete: "cascade" }),
  type: text("type").notNull(), payload: jsonb("payload").notNull().default({}),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0), maxAttempts: integer("maxAttempts").notNull().default(3),
  runAt: time("runAt").notNull().defaultNow(), lockedBy: text("lockedBy"), lockedUntil: time("lockedUntil"),
  dedupeKey: text("dedupeKey"), result: jsonb("result"), lastError: text("lastError"),
  startedAt: time("startedAt"), finishedAt: time("finishedAt"), ...timestamps()
}, t => [check("job_status", sql`${t.status} in ('queued', 'running', 'completed', 'failed')`),
  check("job_attempts", sql`${t.attempts} >= 0 and ${t.maxAttempts} between 1 and 10`),
  index("job_ready").on(t.runAt).where(sql`${t.status} = 'queued'`),
  index("job_user").on(t.userID, t.createdAt),
  uniqueIndex("ux_job_dedupe").on(t.userID, t.type, t.dedupeKey).where(sql`${t.dedupeKey} is not null and ${t.status} in ('queued', 'running')`)]);

// The trail of what happened to a job and when -- queued, each attempt starting, a
// handler's own log lines, retries, the final outcome. Read it top to bottom to trace a bug.
export const jobEvent = pgTable("JobEvent", {
  id: id(), jobID: uuid("jobID").notNull().references(() => job.id, { onDelete: "cascade" }),
  event: text("event").notNull(), attempt: integer("attempt").notNull().default(0),
  message: text("message"), data: jsonb("data"), at: time("at").notNull().defaultNow()
}, t => [check("job_event", sql`${t.event} in ('queued', 'started', 'log', 'retry_scheduled', 'completed', 'failed')`),
  index("job_event_job").on(t.jobID, t.at)]);
