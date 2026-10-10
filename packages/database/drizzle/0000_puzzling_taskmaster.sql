CREATE TABLE "Account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userID" uuid NOT NULL,
	"courseID" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"points" integer,
	"dueAt" timestamp with time zone,
	"availableUntil" timestamp with time zone,
	"canvasAssignmentID" text,
	"htmlURL" text,
	"syncedAt" timestamp with time zone,
	"submittedAt" timestamp with time zone,
	"submissionState" text,
	"late" boolean,
	"missing" boolean,
	"excused" boolean,
	"completedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "AssignmentDetail" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignmentID" uuid NOT NULL,
	"subtasks" jsonb,
	"summary" text,
	"priorityScore" integer,
	"estimatedMinutes" integer,
	"estimateSource" text,
	CONSTRAINT "AssignmentDetail_assignmentID_unique" UNIQUE("assignmentID"),
	CONSTRAINT "estimate_minutes" CHECK ("AssignmentDetail"."estimatedMinutes" between 1 and 6000),
	CONSTRAINT "estimate_source" CHECK ("AssignmentDetail"."estimateSource" in ('student', 'ai'))
);
--> statement-breakpoint
CREATE TABLE "CalendarConfig" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"configID" uuid NOT NULL,
	"defaultCalendar" text,
	"filteredEvents" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "CalendarConfig_configID_unique" UNIQUE("configID")
);
--> statement-breakpoint
CREATE TABLE "CalendarEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignmentID" uuid NOT NULL,
	"title" text,
	"calendar" text,
	"eventStart" timestamp with time zone,
	"eventEnd" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "CanvasAuth" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userID" uuid NOT NULL,
	"authType" text DEFAULT 'oauth' NOT NULL,
	"canvasBaseURL" text NOT NULL,
	"canvasUserID" text,
	"canvasName" text,
	"accessToken" text NOT NULL,
	"refreshToken" text,
	"expiresAt" timestamp with time zone,
	"scope" text,
	"connectedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "CanvasAuth_userID_unique" UNIQUE("userID"),
	CONSTRAINT "canvas_auth_type" CHECK ("CanvasAuth"."authType" in ('oauth', 'pat'))
);
--> statement-breakpoint
CREATE TABLE "Config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userID" uuid NOT NULL,
	"canvasURL" text,
	"canvasKey" text,
	"calendarKey" text,
	"modelKey" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "Config_userID_unique" UNIQUE("userID")
);
--> statement-breakpoint
CREATE TABLE "Course" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"department" text,
	"semester" text,
	"canvasBaseURL" text,
	"canvasCourseID" text,
	"courseCode" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "DashboardLayout" (
	"userID" uuid PRIMARY KEY NOT NULL,
	"layout" jsonb,
	"theme" text,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "layout_array" CHECK (jsonb_typeof("DashboardLayout"."layout") = 'array')
);
--> statement-breakpoint
CREATE TABLE "AuthSession" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"token" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "AuthSession_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "StudySession" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userID" uuid NOT NULL,
	"assignmentID" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"startedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"pausedAt" timestamp with time zone,
	"resumedAt" timestamp with time zone,
	"endedAt" timestamp with time zone,
	"durationSeconds" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_status" CHECK ("StudySession"."status" in ('active', 'paused', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "User_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "Verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_userID_User_id_fk" FOREIGN KEY ("userID") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_courseID_Course_id_fk" FOREIGN KEY ("courseID") REFERENCES "public"."Course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "AssignmentDetail" ADD CONSTRAINT "AssignmentDetail_assignmentID_Assignment_id_fk" FOREIGN KEY ("assignmentID") REFERENCES "public"."Assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CalendarConfig" ADD CONSTRAINT "CalendarConfig_configID_Config_id_fk" FOREIGN KEY ("configID") REFERENCES "public"."Config"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_assignmentID_Assignment_id_fk" FOREIGN KEY ("assignmentID") REFERENCES "public"."Assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CanvasAuth" ADD CONSTRAINT "CanvasAuth_userID_User_id_fk" FOREIGN KEY ("userID") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Config" ADD CONSTRAINT "Config_userID_User_id_fk" FOREIGN KEY ("userID") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_userID_User_id_fk" FOREIGN KEY ("userID") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_userID_User_id_fk" FOREIGN KEY ("userID") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_assignmentID_Assignment_id_fk" FOREIGN KEY ("assignmentID") REFERENCES "public"."Assignment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user" ON "Account" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider" ON "Account" USING btree ("providerId","accountId");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_assignment_user_canvas" ON "Assignment" USING btree ("userID","canvasAssignmentID");--> statement-breakpoint
CREATE INDEX "assignment_course" ON "Assignment" USING btree ("courseID");--> statement-breakpoint
CREATE INDEX "assignment_due" ON "Assignment" USING btree ("dueAt");--> statement-breakpoint
CREATE INDEX "calendar_assignment" ON "CalendarEvent" USING btree ("assignmentID");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_course_canvas" ON "Course" USING btree ("canvasBaseURL","canvasCourseID");--> statement-breakpoint
CREATE INDEX "auth_session_user" ON "AuthSession" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_studysession_one_open_per_user" ON "StudySession" USING btree ("userID") WHERE "StudySession"."status" in ('active', 'paused');--> statement-breakpoint
CREATE INDEX "study_user" ON "StudySession" USING btree ("userID");--> statement-breakpoint
CREATE INDEX "study_assignment" ON "StudySession" USING btree ("assignmentID");--> statement-breakpoint
CREATE INDEX "verification_identifier" ON "Verification" USING btree ("identifier");