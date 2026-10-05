-- A password set by the admin (or by admin:bootstrap) is replaced by the user's own at the next
-- login (H20, T-016c).
ALTER TABLE "users" ADD COLUMN "password_change_required" BOOLEAN NOT NULL DEFAULT false;
