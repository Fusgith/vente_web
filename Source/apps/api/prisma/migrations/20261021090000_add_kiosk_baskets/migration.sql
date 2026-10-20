-- Self-service kiosk (T-036, RG-BOR-01 à 06, H74): a kiosk station and the baskets it sends.
ALTER TYPE "station_type" ADD VALUE 'KIOSK';

CREATE TABLE "kiosk_baskets" (
  "id" UUID NOT NULL,
  "station_id" UUID NOT NULL,
  "day" DATE NOT NULL,
  "seq" INTEGER NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "phone" VARCHAR(20) NOT NULL,
  "lines" JSONB NOT NULL,
  "line_count" INTEGER NOT NULL,
  "total" DECIMAL(14,2) NOT NULL,
  "taken_by_id" UUID,
  "order_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kiosk_baskets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kiosk_baskets_order_id_key" ON "kiosk_baskets"("order_id");
CREATE UNIQUE INDEX "kiosk_baskets_day_seq_key" ON "kiosk_baskets"("day", "seq");
CREATE INDEX "kiosk_baskets_station_id_created_at_idx" ON "kiosk_baskets"("station_id", "created_at");

ALTER TABLE "kiosk_baskets" ADD CONSTRAINT "kiosk_baskets_station_id_fkey"
  FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kiosk_baskets" ADD CONSTRAINT "kiosk_baskets_taken_by_id_fkey"
  FOREIGN KEY ("taken_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "kiosk_baskets" ADD CONSTRAINT "kiosk_baskets_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
