-- A customer's category (H43, H49 a, T-029b): it classes the customer, who stays identified by
-- name and phone. A new customer is « Divers »; the list itself is the `customer_categories` setting.
ALTER TABLE "customers" ADD COLUMN "category" VARCHAR(40) NOT NULL DEFAULT 'Divers';
