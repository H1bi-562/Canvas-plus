-- Migration: add JWT tracking/revocation table
CREATE TABLE IF NOT EXISTS "Token" (
  jti          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "userID"     UUID        NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "issuedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expiresAt"  TIMESTAMPTZ NOT NULL,
  revoked      BOOLEAN     NOT NULL DEFAULT FALSE,
  "revokedAt"  TIMESTAMPTZ
);
 
CREATE INDEX IF NOT EXISTS idx_token_user    ON "Token"("userID");
CREATE INDEX IF NOT EXISTS idx_token_expires ON "Token"("expiresAt");