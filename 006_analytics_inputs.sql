-- Migration: inputs for UC21 Study Analytics (estimated vs. actual, on-time rate)
-- Nathan Salazar
--
-- Additive only: every new column is nullable, so existing rows and teammates'
-- routes are unaffected. Safe to run more than once.

-- ── Estimates ─────────────────────────────────────────────────────────────
-- How long the student expects an assignment to take. Entered by the student
-- today; UC7 (AI estimation) can fill it later, which is why the source is kept
-- -- analytics should be able to tell "my guess was off" from "the AI's was".
-- Capped at 100 hours so a typo (6000 instead of 60) cannot wreck the charts.
ALTER TABLE "AssignmentDetail"
  ADD COLUMN IF NOT EXISTS "estimatedMinutes" INTEGER
    CHECK ("estimatedMinutes" BETWEEN 1 AND 6000),
  ADD COLUMN IF NOT EXISTS "estimateSource" TEXT
    CHECK ("estimateSource" IN ('student', 'ai'));

-- ── Completion ────────────────────────────────────────────────────────────
-- Two sources, stored separately so neither overwrites the other:
--   * Canvas's view of the submission, refreshed on every sync
--     (submittedAt, submissionState, late, missing, excused)
--   * the student's own "Mark done" (completedAt), for work Canvas does not
--     track -- paper quizzes, in-person demos. Sync never touches it.
ALTER TABLE "Assignment"
  ADD COLUMN IF NOT EXISTS "submittedAt"     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "submissionState" TEXT,
  ADD COLUMN IF NOT EXISTS late              BOOLEAN,
  ADD COLUMN IF NOT EXISTS missing           BOOLEAN,
  ADD COLUMN IF NOT EXISTS excused           BOOLEAN,
  ADD COLUMN IF NOT EXISTS "completedAt"     TIMESTAMPTZ;
