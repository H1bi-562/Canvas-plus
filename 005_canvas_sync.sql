-- Migration: Canvas assignment sync + personal access token (PAT) connections
-- Nathan Salazar
--
-- Additive only: every new column is nullable or defaulted, so existing rows and
-- teammates' routes keep working unchanged. Safe to run more than once.

-- ── CanvasAuth: how the user connected ────────────────────────────────────
-- CSULB IT may grant personal access tokens instead of an OAuth2 developer key.
-- A PAT has no refresh token and no expiry Canvas tells us about, so the token
-- lifecycle has to know which kind it is holding.
ALTER TABLE "CanvasAuth"
  ADD COLUMN IF NOT EXISTS "authType" TEXT NOT NULL DEFAULT 'oauth';

DO $$ BEGIN
  ALTER TABLE "CanvasAuth"
    ADD CONSTRAINT canvasauth_authtype_check CHECK ("authType" IN ('oauth', 'pat'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Course: link rows to the Canvas course they came from ─────────────────
-- "Course" has no userID, so a row is shared by every student in that class.
-- Sync therefore writes only course metadata (name, code, term) here and never
-- the per-student "grade" column -- one student's grade must not land in a row
-- another student's assignments point at.
--
-- Keyed on base URL + Canvas id because ids are only unique per instance
-- (a local test Canvas and csulb.instructure.com both have a course 101).
ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "canvasBaseURL"  TEXT,
  ADD COLUMN IF NOT EXISTS "canvasCourseID" TEXT,
  ADD COLUMN IF NOT EXISTS "courseCode"     TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_course_canvas
  ON "Course" ("canvasBaseURL", "canvasCourseID");

-- ── Assignment: make re-syncing an update, not a duplicate ────────────────
-- Unique per user, so two students in the same class each get their own row.
-- Postgres treats NULLs as distinct, so manually created assignments (no
-- Canvas id) are unaffected by the constraint.
ALTER TABLE "Assignment"
  ADD COLUMN IF NOT EXISTS "canvasAssignmentID" TEXT,
  ADD COLUMN IF NOT EXISTS "htmlURL"            TEXT,
  ADD COLUMN IF NOT EXISTS "syncedAt"           TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS ux_assignment_user_canvas
  ON "Assignment" ("userID", "canvasAssignmentID");
