-- Migration: track resume instant so paused time is excluded from durationSeconds
-- Nathan Salazar (UC24 - study timer)
--
-- "durationSeconds" accumulates ACTIVE seconds only. The current active
-- segment runs from COALESCE("resumedAt", "startedAt") to now, so a session
-- can be paused and resumed any number of times without inflating the total.

ALTER TABLE "StudySession"
  ADD COLUMN IF NOT EXISTS "resumedAt" TIMESTAMPTZ;

-- Existing rows start with no accumulated time rather than NULL, so the
-- accumulate-on-pause arithmetic below never hits a NULL operand.
UPDATE "StudySession" SET "durationSeconds" = 0 WHERE "durationSeconds" IS NULL;

ALTER TABLE "StudySession"
  ALTER COLUMN "durationSeconds" SET DEFAULT 0;

-- Only one open (active or paused) session per user; ending one clears the way
-- for the next. Enforced in the DB so a double-tap on Start cannot create two.
CREATE UNIQUE INDEX IF NOT EXISTS idx_studysession_one_open_per_user
  ON "StudySession"("userID")
  WHERE status IN ('active', 'paused');
