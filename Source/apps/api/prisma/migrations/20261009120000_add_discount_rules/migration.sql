-- The owner's discount rules (H62, T-090): a suggested discount the cashier applies at the
-- customer's request (H61), by quantity, by customer category or over a promotion period.
ALTER TYPE "discount_source" ADD VALUE 'RULE' BEFORE 'CODE';

CREATE TYPE "discount_rule_kind" AS ENUM ('QUANTITY', 'CUSTOMER_CATEGORY', 'PROMOTION');

CREATE TABLE "discount_rules" (
    "id" UUID NOT NULL,
    "kind" "discount_rule_kind" NOT NULL,
    "product_id" UUID,
    "category_id" UUID,
    "min_qty" DECIMAL(12,2),
    "customer_category" VARCHAR(40),
    "pct" DECIMAL(5,2) NOT NULL,
    "starts_on" DATE,
    "ends_on" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "discount_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "discount_rules_scope_check" CHECK ("product_id" IS NULL OR "category_id" IS NULL),
    CONSTRAINT "discount_rules_pct_check" CHECK ("pct" > 0 AND "pct" <= 100),
    CONSTRAINT "discount_rules_quantity_check" CHECK (("kind" = 'QUANTITY') = ("min_qty" IS NOT NULL) AND ("min_qty" IS NULL OR "min_qty" > 0)),
    CONSTRAINT "discount_rules_category_check" CHECK (("kind" = 'CUSTOMER_CATEGORY') = ("customer_category" IS NOT NULL)),
    CONSTRAINT "discount_rules_promotion_check" CHECK ("kind" <> 'PROMOTION' OR ("starts_on" IS NOT NULL AND "ends_on" IS NOT NULL)),
    CONSTRAINT "discount_rules_dates_check" CHECK ("starts_on" IS NULL OR "ends_on" IS NULL OR "ends_on" >= "starts_on")
);

CREATE INDEX "discount_rules_is_active_idx" ON "discount_rules"("is_active");

ALTER TABLE "discount_rules" ADD CONSTRAINT "discount_rules_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "discount_rules" ADD CONSTRAINT "discount_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "discount_rules" ADD CONSTRAINT "discount_rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
