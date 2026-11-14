CREATE TABLE "Reward" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userID" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rarityPercent" double precision NOT NULL,
	"trigger" text DEFAULT 'any' NOT NULL,
	"minStudyMinutes" integer,
	"requireOnTime" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_name" CHECK (length(btrim("Reward"."name")) between 1 and 80),
	CONSTRAINT "reward_rarity" CHECK ("Reward"."rarityPercent" > 0 and "Reward"."rarityPercent" <= 100),
	CONSTRAINT "reward_trigger" CHECK ("Reward"."trigger" in ('any', 'assignment', 'study_session')),
	CONSTRAINT "reward_min_study" CHECK ("Reward"."minStudyMinutes" between 1 and 1440)
);
--> statement-breakpoint
CREATE TABLE "RewardRoll" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userID" uuid NOT NULL,
	"rewardID" uuid,
	"rewardName" text,
	"trigger" text NOT NULL,
	"assignmentID" uuid,
	"studySessionID" uuid,
	"rolledAt" timestamp with time zone DEFAULT now() NOT NULL,
	"claimedAt" timestamp with time zone,
	CONSTRAINT "roll_trigger" CHECK ("RewardRoll"."trigger" in ('assignment', 'study_session')),
	CONSTRAINT "roll_source" CHECK (("RewardRoll"."assignmentID" is null or "RewardRoll"."trigger" = 'assignment') and ("RewardRoll"."studySessionID" is null or "RewardRoll"."trigger" = 'study_session')),
	CONSTRAINT "roll_won" CHECK ("RewardRoll"."rewardID" is null or "RewardRoll"."rewardName" is not null)
);
--> statement-breakpoint
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_userID_User_id_fk" FOREIGN KEY ("userID") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "RewardRoll" ADD CONSTRAINT "RewardRoll_userID_User_id_fk" FOREIGN KEY ("userID") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "RewardRoll" ADD CONSTRAINT "RewardRoll_rewardID_Reward_id_fk" FOREIGN KEY ("rewardID") REFERENCES "public"."Reward"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "RewardRoll" ADD CONSTRAINT "RewardRoll_assignmentID_Assignment_id_fk" FOREIGN KEY ("assignmentID") REFERENCES "public"."Assignment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "RewardRoll" ADD CONSTRAINT "RewardRoll_studySessionID_StudySession_id_fk" FOREIGN KEY ("studySessionID") REFERENCES "public"."StudySession"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reward_user" ON "Reward" USING btree ("userID");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_roll_assignment" ON "RewardRoll" USING btree ("userID","assignmentID") WHERE "RewardRoll"."assignmentID" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_roll_session" ON "RewardRoll" USING btree ("studySessionID") WHERE "RewardRoll"."studySessionID" is not null;--> statement-breakpoint
CREATE INDEX "roll_user" ON "RewardRoll" USING btree ("userID","rolledAt");