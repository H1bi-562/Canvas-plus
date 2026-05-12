CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "User" (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT        UNIQUE NOT NULL,
  "hashedPassword" TEXT        NOT NULL,
  "createdAt"      TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Config" (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "userID"      UUID        NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "canvasURL"   TEXT,
  "canvasKey"   TEXT,
  "calendarKey" TEXT,
  "modelKey"    TEXT,
  "createdAt"   TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE ("userID")
);

CREATE TABLE IF NOT EXISTS "CalendarConfig" (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "configID"        UUID        NOT NULL REFERENCES "Config"(id) ON DELETE CASCADE,
  "defaultCalendar" TEXT,
  "filteredEvents"  JSONB,
  "createdAt"       TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE ("configID")
);

CREATE TABLE IF NOT EXISTS "Course" (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  department   TEXT,
  grade        TEXT,
  semester     TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Assignment" (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "userID"         UUID        NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "courseID"       UUID        NOT NULL REFERENCES "Course"(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL,
  description      TEXT,
  points           INTEGER,
  "dueAt"          TIMESTAMPTZ,
  "availableUntil" TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS "AssignmentDetail" (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  "assignmentID"  UUID    NOT NULL REFERENCES "Assignment"(id) ON DELETE CASCADE,
  subtasks        JSONB,
  summary         TEXT,
  "priorityScore" INTEGER,
  UNIQUE ("assignmentID")
);

CREATE TABLE IF NOT EXISTS "CalendarEvent" (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "assignmentID" UUID        NOT NULL REFERENCES "Assignment"(id) ON DELETE CASCADE,
  title          TEXT,
  calendar       TEXT,
  "eventStart"   TIMESTAMPTZ,
  "eventEnd"     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_assignment_user   ON "Assignment"("userID");
CREATE INDEX IF NOT EXISTS idx_assignment_course ON "Assignment"("courseID");
CREATE INDEX IF NOT EXISTS idx_assignment_due    ON "Assignment"("dueAt");
CREATE INDEX IF NOT EXISTS idx_event_assignment  ON "CalendarEvent"("assignmentID");
CREATE INDEX IF NOT EXISTS idx_config_user       ON "Config"("userID");