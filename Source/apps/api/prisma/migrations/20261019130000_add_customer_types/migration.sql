-- T-093 (H66): the customer's type sets the price of each line; a sale unit keeps its base
-- price and may carry one price per customer type, dated like the base one (RG-ART-07).
CREATE TYPE "customer_type" AS ENUM ('WHOLESALER', 'SEMI_WHOLESALER', 'RETAILER', 'INDIVIDUAL');

ALTER TABLE "customers" ADD COLUMN "type" "customer_type" NOT NULL DEFAULT 'INDIVIDUAL';

ALTER TABLE "product_prices" ADD COLUMN "customer_type" "customer_type";

-- One current price per unit and customer type, the base price (null type) included.
DROP INDEX "product_prices_one_current_per_unit_key";
CREATE UNIQUE INDEX "product_prices_one_current_per_unit_key"
  ON "product_prices" ("product_unit_id", "customer_type") NULLS NOT DISTINCT
  WHERE "effective_to" IS NULL;
