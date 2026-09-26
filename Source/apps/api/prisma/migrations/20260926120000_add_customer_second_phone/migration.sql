-- H26 (decided 26/09/2026): up to two phone numbers per customer; a number belongs to one
-- active customer only, as its first or its second phone (RG-DEV-04).

-- AlterTable
ALTER TABLE "customers" ADD COLUMN "second_phone" VARCHAR(32);
ALTER TABLE "customers"
  ADD CONSTRAINT "customers_second_phone_check" CHECK ("second_phone" IS NULL OR "second_phone" <> "phone");

-- CreateTable: every number of an active customer, once. Its primary key refuses a number
-- already held, whichever column holds it and whatever the order of concurrent writes.
CREATE TABLE "customer_phones" (
    "phone" VARCHAR(32) NOT NULL,
    "customer_id" UUID NOT NULL,

    CONSTRAINT "customer_phones_pkey" PRIMARY KEY ("phone")
);

-- CreateIndex
CREATE INDEX "customer_phones_customer_id_idx" ON "customer_phones"("customer_id");

-- AddForeignKey
ALTER TABLE "customer_phones" ADD CONSTRAINT "customer_phones_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Kept by the database alone: the application never writes customer_phones.
CREATE FUNCTION customers_sync_phones() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "customer_phones" WHERE "customer_id" = NEW."id";
  IF NEW."is_active" THEN
    INSERT INTO "customer_phones" ("phone", "customer_id") VALUES (NEW."phone", NEW."id");
    IF NEW."second_phone" IS NOT NULL THEN
      INSERT INTO "customer_phones" ("phone", "customer_id") VALUES (NEW."second_phone", NEW."id");
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "customers_sync_phones_trg"
  AFTER INSERT OR UPDATE OF "phone", "second_phone", "is_active" ON "customers"
  FOR EACH ROW EXECUTE FUNCTION customers_sync_phones();

INSERT INTO "customer_phones" ("phone", "customer_id")
  SELECT "phone", "id" FROM "customers" WHERE "is_active";

-- Replaced by customer_phones, which also covers the second phone.
DROP INDEX "customers_phone_active_key";
