-- T-051 register payment (RG-PAY, RG-CAI-01/02, H32).

-- A payment sent twice over the shop's Wi-Fi is recorded once: the key the screen gives it.
ALTER TABLE "payments" ADD COLUMN "idempotency_key" UUID NOT NULL;
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- One open session per register, as per cashier (RG-CAI-01/02).
CREATE UNIQUE INDEX "register_sessions_one_open_per_station_key" ON "register_sessions" ("station_id")
  WHERE "closed_at" IS NULL;

-- RG-PAY-04: a card payment carries its transaction reference, like mobile money.
UPDATE "payment_methods" SET "requires_reference" = true WHERE "code" = 'CARD';
