-- Migration: cache key for AI-generated assignment output (UC10)
-- Jace Orozco -- Week: Sep.13 - Sep.19
--
-- "Add cache for AI output to optimize token usage": before calling the AI
-- model for an assignment's summary/subtasks (UC10/UC13), check whether we
-- already generated output for this exact assignment content. contentHash is
-- a hash of the fields that actually go into the prompt (title, description,
-- points) -- if none of those changed since the last call, the cached row in
-- AssignmentDetail is still correct and the AI does not need to run again.
--
-- Additive only: both new columns are nullable, so existing rows and
-- teammates' routes are unaffected. Safe to run more than once.

ALTER TABLE "AssignmentDetail"
  ADD COLUMN IF NOT EXISTS "contentHash" TEXT,
  ADD COLUMN IF NOT EXISTS "generatedAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_assignmentdetail_contenthash
  ON "AssignmentDetail"("contentHash");
