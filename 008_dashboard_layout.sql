-- Migration: UC22 Customizable Dashboard & Widget Layout
-- Nathan Salazar
--
-- One row per student holding their home screen customization:
--   layout  the widget grid; NULL means "use the default layout", so Reset is
--           an UPDATE to NULL and new users need no row at all
--   theme   the colour theme id; NULL means the default theme
-- Both are validated in services/dashboardLayout.js before they are written;
-- the columns only guarantee the layout is a JSON array.
--
-- Numbered 008 because 007 is taken by 007_ai_output_cache.sql (UC10/UC13).
-- Additive only. Safe to run more than once.

CREATE TABLE IF NOT EXISTS "DashboardLayout" (
  "userID"    UUID        PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE,
  layout      JSONB       CHECK (jsonb_typeof(layout) = 'array'),
  theme       TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The first version of this table (applied 2026-09-25) had no theme column
-- and a NOT NULL layout; bring it up to date.
ALTER TABLE "DashboardLayout" ADD COLUMN IF NOT EXISTS theme TEXT;
ALTER TABLE "DashboardLayout" ALTER COLUMN layout DROP NOT NULL;
