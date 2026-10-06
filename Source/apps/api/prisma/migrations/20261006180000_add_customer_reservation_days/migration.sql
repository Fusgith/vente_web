-- A customer's own reservation duration, in days after the day of validation (RG-STK-02, H45,
-- T-022b): a particular condition, e.g. a customer living far; null: the general
-- `reservation_days` setting. The upper bound is technical only.
ALTER TABLE "customers" ADD COLUMN "reservation_days" INTEGER;
ALTER TABLE "customers" ADD CONSTRAINT "customers_reservation_days_check"
    CHECK ("reservation_days" BETWEEN 0 AND 365);
