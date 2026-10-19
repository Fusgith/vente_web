-- Bill of exchange and post-dated check (H68): a receivable covered by a title until its due day.
CREATE TYPE "instrument_status" AS ENUM ('HANDED', 'CASHED', 'UNPAID');

ALTER TABLE "receivables"
  ADD COLUMN "instrument_method_id" UUID,
  ADD COLUMN "instrument_number" VARCHAR(80),
  ADD COLUMN "instrument_bank" VARCHAR(60),
  ADD COLUMN "instrument_status" "instrument_status";

ALTER TABLE "receivables" ADD CONSTRAINT "receivables_instrument_method_id_fkey"
  FOREIGN KEY ("instrument_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "payment_methods" ("id", "code", "label", "requires_reference", "is_active", "sort_order")
VALUES (gen_random_uuid(), 'BILL_OF_EXCHANGE', 'Traite', true, true, 9),
       (gen_random_uuid(), 'POSTDATED_CHECK', 'Chèque post-daté', true, true, 10)
ON CONFLICT ("code") DO NOTHING;
