ALTER TABLE "CalendarConfig" ADD COLUMN "syncToGoogle" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "CalendarEvent" ADD COLUMN "googleEventID" text;