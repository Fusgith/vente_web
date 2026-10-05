-- The owner's one-time activation code (RG-USR-10, H20, T-016b): argon2id hash and its expiry,
-- both set or both null.
ALTER TABLE "users"
  ADD COLUMN "activation_code_hash" TEXT,
  ADD COLUMN "activation_expires_at" TIMESTAMPTZ(6),
  ADD CONSTRAINT "users_activation_pair_check"
    CHECK (("activation_code_hash" IS NULL) = ("activation_expires_at" IS NULL));
