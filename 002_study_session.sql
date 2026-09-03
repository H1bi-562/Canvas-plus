-- Migration: Study session tracking & timer
REATE TABLE IF NOT EXISTS "StudySession" (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "userID"          UUID        NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "assignmentID"    UUID        REFERENCES "Assignment"(id) ON DELETE SET NULL,
  status            TEXT        NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'paused', 'completed')),
  "startedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "pausedAt"        TIMESTAMPTZ,
  "endedAt"         TIMESTAMPTZ,
  "durationSeconds" INTEGER,
  "createdAt"       TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ DEFAULT NOW()
);
 
CREATE INDEX IF NOT EXISTS idx_studysession_user       ON "StudySession"("userID");
CREATE INDEX IF NOT EXISTS idx_studysession_assignment ON "StudySession"("assignmentID");
CREATE INDEX IF NOT EXISTS idx_studysession_status     ON "StudySession"("status");