ALTER TABLE "Config" ADD COLUMN "onboardingSteps" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "Config" ADD COLUMN "onboardingCompletedAt" timestamp with time zone;