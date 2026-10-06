-- Identifier and password everywhere, no PIN (H57, T-017d). The enum value PIN stays for the
-- sessions opened before: they end within AUTH_SESSION_HOURS.
ALTER TABLE "users" DROP COLUMN "pin_hash";
