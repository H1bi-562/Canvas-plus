ALTER TABLE "AssignmentDetail" ADD COLUMN "contentHash" text;--> statement-breakpoint
ALTER TABLE "AssignmentDetail" ADD COLUMN "generatedAt" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_assignmentdetail_contenthash" ON "AssignmentDetail" USING btree ("contentHash");
