import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, uniqueIndex, index, check } from "drizzle-orm/pg-core";

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
  canvasURL: text("canvasURL"), canvasKey: text("canvasKey"), calendarKey: text("calendarKey"), modelKey: text("modelKey"), ...timestamps()
});

export const calendarConfig = pgTable("CalendarConfig", {
  id: id(), configID: uuid("configID").notNull().unique().references(() => config.id, { onDelete: "cascade" }),
  defaultCalendar: text("defaultCalendar"), filteredEvents: jsonb("filteredEvents"), ...timestamps()
});

export const course = pgTable("Course", {
  id: id(), name: text("name").notNull(), department: text("department"), semester: text("semester"),
  canvasBaseURL: text("canvasBaseURL"), canvasCourseID: text("canvasCourseID"), courseCode: text("courseCode"),
  created_at: time("created_at").defaultNow(), updated_at: time("updated_at").defaultNow()
}, t => [uniqueIndex("ux_course_canvas").on(t.canvasBaseURL, t.canvasCourseID)]);

export const assignment = pgTable("Assignment", {
  id: id(), userID: uuid("userID").notNull().references(() => user.id, { onDelete: "cascade" }),
  courseID: uuid("courseID").notNull().references(() => course.id, { onDelete: "cascade" }),
  title: text("title").notNull(), description: text("description"), points: integer("points"),
  dueAt: time("dueAt"), availableUntil: time("availableUntil"), canvasAssignmentID: text("canvasAssignmentID"),
  htmlURL: text("htmlURL"), syncedAt: time("syncedAt"), submittedAt: time("submittedAt"),
  submissionState: text("submissionState"), late: boolean("late"), missing: boolean("missing"),
  excused: boolean("excused"), completedAt: time("completedAt")
}, t => [uniqueIndex("ux_assignment_user_canvas").on(t.userID, t.canvasAssignmentID), index("assignment_course").on(t.courseID), index("assignment_due").on(t.dueAt)]);

// UC10/UC13 -- contentHash/generatedAt added by Jace Orozco so the AI route
// (whoever builds it) can skip re-generating output for content it has
// already seen: contentHash is a hash of the fields that actually go into
// the AI prompt (title, description, points), and a match means the cached
// summary/subtasks/priorityScore are still correct for the current content.
export const assignmentDetail = pgTable("AssignmentDetail", {
  id: id(), assignmentID: uuid("assignmentID").notNull().unique().references(() => assignment.id, { onDelete: "cascade" }),
  subtasks: jsonb("subtasks"), summary: text("summary"), priorityScore: integer("priorityScore"),
  estimatedMinutes: integer("estimatedMinutes"), estimateSource: text("estimateSource"),
  contentHash: text("contentHash"), generatedAt: time("generatedAt")
}, t => [check("estimate_minutes", sql`${t.estimatedMinutes} between 1 and 6000`), check("estimate_source", sql`${t.estimateSource} in ('student', 'ai')`),
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
