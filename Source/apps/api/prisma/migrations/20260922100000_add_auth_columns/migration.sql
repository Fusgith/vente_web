-- T-012 auth: session token hash + auth method, TOTP enrolment state, lockout counters (RG-USR-03/04/05).

-- No session can be valid without a token hash: drop whatever the previous schema stored.
DELETE FROM "sessions";

-- CreateEnum
CREATE TYPE "session_auth_method" AS ENUM ('PIN', 'PASSWORD', 'PASSWORD_TOTP');

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "auth_method" "session_auth_method" NOT NULL,
ADD COLUMN     "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "token_hash" VARCHAR(64) NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_login_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_failed_at" TIMESTAMPTZ(6),
ADD COLUMN     "locked_until" TIMESTAMPTZ(6),
ADD COLUMN     "totp_enabled_at" TIMESTAMPTZ(6),
ADD COLUMN     "totp_last_step" INTEGER,
ADD COLUMN     "totp_pending_secret" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- Manual constraints (RG-USR-05): counters never negative; an enabled TOTP always has a secret.
ALTER TABLE "users"
  ADD CONSTRAINT "users_failed_login_count_check" CHECK ("failed_login_count" >= 0),
  ADD CONSTRAINT "users_totp_enabled_has_secret_check"
    CHECK ("totp_enabled_at" IS NULL OR "totp_secret" IS NOT NULL);
