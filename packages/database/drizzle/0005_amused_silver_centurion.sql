CREATE TABLE "Job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userID" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"maxAttempts" integer DEFAULT 3 NOT NULL,
	"runAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lockedBy" text,
	"lockedUntil" timestamp with time zone,
	"dedupeKey" text,
	"result" jsonb,
	"lastError" text,
	"startedAt" timestamp with time zone,
	"finishedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_status" CHECK ("Job"."status" in ('queued', 'running', 'completed', 'failed')),
	CONSTRAINT "job_attempts" CHECK ("Job"."attempts" >= 0 and "Job"."maxAttempts" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "JobEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jobID" uuid NOT NULL,
	"event" text NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"message" text,
	"data" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_event" CHECK ("JobEvent"."event" in ('queued', 'started', 'log', 'retry_scheduled', 'completed', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "Job" ADD CONSTRAINT "Job_userID_User_id_fk" FOREIGN KEY ("userID") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "JobEvent" ADD CONSTRAINT "JobEvent_jobID_Job_id_fk" FOREIGN KEY ("jobID") REFERENCES "public"."Job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_ready" ON "Job" USING btree ("runAt") WHERE "Job"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "job_user" ON "Job" USING btree ("userID","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_job_dedupe" ON "Job" USING btree ("userID","type","dedupeKey") WHERE "Job"."dedupeKey" is not null and "Job"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "job_event_job" ON "JobEvent" USING btree ("jobID","at");