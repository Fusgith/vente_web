-- T-094, H69: a handed-over quote changed, an order changed at the register, sent back or
-- refused at reactivation takes a new number; the old one stays, REPLACED, linked to it.
ALTER TYPE "order_status" ADD VALUE 'REPLACED';

ALTER TABLE "orders"
  ADD COLUMN "handed_at" TIMESTAMPTZ(6),
  ADD COLUMN "replaced_by_id" UUID;

ALTER TABLE "orders" ADD CONSTRAINT "orders_replaced_by_id_fkey"
  FOREIGN KEY ("replaced_by_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
