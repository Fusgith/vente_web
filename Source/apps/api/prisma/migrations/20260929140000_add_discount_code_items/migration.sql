-- T-034 discount codes issued by the owner (RG-REM-04, decision H22, H41): a code carries items,
-- each a product (all its sale units) or, product null, the order total, with a rate or an
-- amount; the code's own single value goes.
ALTER TABLE "discount_codes"
  DROP CONSTRAINT "discount_codes_value_check",
  DROP CONSTRAINT "discount_codes_pct_check",
  DROP CONSTRAINT "discount_codes_amount_check",
  DROP COLUMN "pct",
  DROP COLUMN "amount",
  -- A code targets an order or, issued before it, a customer.
  ADD CONSTRAINT "discount_codes_target_check" CHECK ("order_id" IS NOT NULL OR "customer_id" IS NOT NULL),
  ADD CONSTRAINT "discount_codes_used_check" CHECK (("status" = 'USED') = ("used_at" IS NOT NULL)),
  ADD CONSTRAINT "discount_codes_revoked_check" CHECK (("status" = 'REVOKED') = ("revoked_at" IS NOT NULL));

CREATE TABLE "discount_code_items" (
  "id" UUID NOT NULL,
  "code_id" UUID NOT NULL,
  "product_id" UUID,
  "pct" DECIMAL(5,2),
  "amount" DECIMAL(14,2),
  CONSTRAINT "discount_code_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "discount_code_items_value_check" CHECK (("pct" IS NOT NULL) <> ("amount" IS NOT NULL)),
  CONSTRAINT "discount_code_items_pct_check" CHECK ("pct" IS NULL OR ("pct" > 0 AND "pct" <= 100)),
  CONSTRAINT "discount_code_items_amount_check" CHECK ("amount" IS NULL OR "amount" > 0)
);
-- A product once per code, and the total once.
CREATE UNIQUE INDEX "discount_code_items_product_key"
  ON "discount_code_items"("code_id", "product_id") WHERE "product_id" IS NOT NULL;
CREATE UNIQUE INDEX "discount_code_items_total_key"
  ON "discount_code_items"("code_id") WHERE "product_id" IS NULL;
CREATE INDEX "discount_code_items_product_id_idx" ON "discount_code_items"("product_id");
ALTER TABLE "discount_code_items" ADD CONSTRAINT "discount_code_items_code_id_fkey"
  FOREIGN KEY ("code_id") REFERENCES "discount_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "discount_code_items" ADD CONSTRAINT "discount_code_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
