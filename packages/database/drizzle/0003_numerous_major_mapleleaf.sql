ALTER TABLE "AssignmentDetail" ADD COLUMN "contentHash" text;--> statement-breakpoint
ALTER TABLE "AssignmentDetail" ADD COLUMN "generatedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "AssignmentDetail" ADD COLUMN "summarySource" text;--> statement-breakpoint
CREATE INDEX "idx_assignmentdetail_contenthash" ON "AssignmentDetail" USING btree ("contentHash");--> statement-breakpoint
ALTER TABLE "AssignmentDetail" ADD CONSTRAINT "summary_source" CHECK ("AssignmentDetail"."summarySource" in ('ai', 'extractive', 'extractive-fallback'));
