CREATE TABLE "AssignmentGroup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"courseID" uuid NOT NULL,
	"canvasGroupID" text NOT NULL,
	"name" text NOT NULL,
	"weight" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Assignment" ADD COLUMN "score" double precision;--> statement-breakpoint
ALTER TABLE "Assignment" ADD COLUMN "groupID" uuid;--> statement-breakpoint
ALTER TABLE "Course" ADD COLUMN "applyGroupWeights" boolean;--> statement-breakpoint
ALTER TABLE "AssignmentGroup" ADD CONSTRAINT "AssignmentGroup_courseID_Course_id_fk" FOREIGN KEY ("courseID") REFERENCES "public"."Course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_assignment_group_canvas" ON "AssignmentGroup" USING btree ("courseID","canvasGroupID");--> statement-breakpoint
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_groupID_AssignmentGroup_id_fk" FOREIGN KEY ("groupID") REFERENCES "public"."AssignmentGroup"("id") ON DELETE set null ON UPDATE no action;