-- T-033 exceptional discount requests (RG-REM-03/05, decision H22, ⚠️ H51 to H54): a request
-- carries items, each a product (all its sale units) or, product null, the order total, with the
-- rate or amount asked and the one granted; the request's own single line and value go. It ends
-- granted, rejected, withdrawn (by the cashier with the customer's agreement, or with the order
-- cancelled) or expired at the end of the shop day.
ALTER TYPE "discount_request_status" ADD VALUE 'WITHDRAWN';
ALTER TYPE "discount_request_status" ADD VALUE 'EXPIRED';

-- Nothing writes requests before T-033; a row left by hand expires with its day.
ALTER TABLE "discount_requests"
  DROP CONSTRAINT "discount_requests_value_check",
  DROP CONSTRAINT "discount_requests_pct_check",
  DROP CONSTRAINT "discount_requests_line_id_fkey",
  DROP COLUMN "line_id",
  DROP COLUMN "requested_pct",
  DROP COLUMN "requested_amount",
  DROP COLUMN "decided_pct",
  ADD COLUMN "note" TEXT,
  ADD COLUMN "withdrawn_by" UUID,
  ADD COLUMN "withdrawn_at" TIMESTAMPTZ(6),
  ADD COLUMN "expires_at" TIMESTAMPTZ(6);
UPDATE "discount_requests" SET "expires_at" = "created_at" + INTERVAL '1 day';
-- The new values are not usable in this transaction: the checks compare the status as text.
ALTER TABLE "discount_requests"
  ALTER COLUMN "expires_at" SET NOT NULL,
  ADD CONSTRAINT "discount_requests_expiry_check" CHECK ("expires_at" > "created_at"),
  ADD CONSTRAINT "discount_requests_decided_check"
    CHECK (("status"::text IN ('GRANTED', 'REJECTED')) = ("decided_at" IS NOT NULL)),
  ADD CONSTRAINT "discount_requests_withdrawn_check"
    CHECK (("status"::text = 'WITHDRAWN') = ("withdrawn_at" IS NOT NULL));
ALTER TABLE "discount_requests" ADD CONSTRAINT "discount_requests_withdrawn_by_fkey"
  FOREIGN KEY ("withdrawn_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "discount_request_items" (
  "id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "product_id" UUID,
  "requested_pct" DECIMAL(5,2),
  "requested_amount" DECIMAL(14,2),
  "decided_pct" DECIMAL(5,2),
  "decided_amount" DECIMAL(14,2),
  CONSTRAINT "discount_request_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "discount_request_items_requested_check"
    CHECK (("requested_pct" IS NOT NULL) <> ("requested_amount" IS NOT NULL)),
  CONSTRAINT "discount_request_items_decided_check"
    CHECK ("decided_pct" IS NULL OR "decided_amount" IS NULL),
  CONSTRAINT "discount_request_items_pct_check" CHECK (
    ("requested_pct" IS NULL OR ("requested_pct" > 0 AND "requested_pct" <= 100))
    AND ("decided_pct" IS NULL OR ("decided_pct" > 0 AND "decided_pct" <= 100))
  ),
  CONSTRAINT "discount_request_items_amount_check" CHECK (
    ("requested_amount" IS NULL OR "requested_amount" > 0)
    AND ("decided_amount" IS NULL OR "decided_amount" > 0)
  )
);
-- A product once per request, and the total once.
CREATE UNIQUE INDEX "discount_request_items_product_key"
  ON "discount_request_items"("request_id", "product_id") WHERE "product_id" IS NOT NULL;
CREATE UNIQUE INDEX "discount_request_items_total_key"
  ON "discount_request_items"("request_id") WHERE "product_id" IS NULL;
CREATE INDEX "discount_request_items_product_id_idx" ON "discount_request_items"("product_id");
ALTER TABLE "discount_request_items" ADD CONSTRAINT "discount_request_items_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "discount_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "discount_request_items" ADD CONSTRAINT "discount_request_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
