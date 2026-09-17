-- Migration: Canvas LMS OAuth2 connection (UC "Create API to connect with Canvas auth")
-- Nathan Salazar
--
-- One row per user holding the OAuth2 grant for their Canvas account.
--
-- Why a separate table instead of widening "Config":
--   GET /api/config returns the entire Config row to the browser. Storing live
--   OAuth tokens there would put them one careless SELECT * away from leaking.
--   Keeping them in their own table means no config read can expose a token,
--   by construction rather than by remembering.
--
-- "accessToken" and "refreshToken" are AES-256-GCM ciphertext (see utils/crypto.js),
-- never plaintext. Nothing in the API returns either column.

CREATE TABLE IF NOT EXISTS "CanvasAuth" (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "userID"         UUID        NOT NULL UNIQUE REFERENCES "User"(id) ON DELETE CASCADE,

  -- Which Canvas instance this grant belongs to. Stored per row so a user who
  -- moves between instances (local dev -> csulb.instructure.com) cannot end up
  -- with a token silently pointed at the wrong host.
  "canvasBaseURL"  TEXT        NOT NULL,

  -- Canvas's own identifiers, returned alongside the token exchange.
  "canvasUserID"   TEXT,
  "canvasName"     TEXT,

  "accessToken"    TEXT        NOT NULL,
  "refreshToken"   TEXT,
  "expiresAt"      TIMESTAMPTZ,
  scope            TEXT,

  "connectedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvasauth_user ON "CanvasAuth"("userID");

-- "Config"."canvasKey" predates this table and held a pasted personal access
-- token in plaintext. It is left in place so teammates' code keeps working,
-- but it is no longer the source of truth for Canvas credentials.
COMMENT ON COLUMN "Config"."canvasKey" IS
  'DEPRECATED: superseded by the "CanvasAuth" table (OAuth2). Do not read for new work.';
