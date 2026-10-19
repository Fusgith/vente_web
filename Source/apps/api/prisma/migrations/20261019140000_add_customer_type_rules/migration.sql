-- Discount rules by customer type (H62, H66). The kind is compared as text: a new enum value
-- cannot be used in the transaction that adds it.
ALTER TYPE "discount_rule_kind" ADD VALUE 'CUSTOMER_TYPE';
ALTER TABLE "discount_rules" ADD COLUMN "customer_type" "customer_type";
ALTER TABLE "discount_rules" ADD CONSTRAINT "discount_rules_type_check"
  CHECK (("kind"::text = 'CUSTOMER_TYPE') = ("customer_type" IS NOT NULL));
