-- Products the owner marks « à proposer » to the salespeople (RG-DEV-06 §6, H46, H49 b, T-037),
-- from the first shop day to the last, both included. Never a price change (RG-ART-07).
CREATE TABLE "product_promotions" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "pitch" VARCHAR(200),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMPTZ(6),

    CONSTRAINT "product_promotions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_promotions_dates_check" CHECK ("ends_on" >= "starts_on")
);

CREATE INDEX "product_promotions_product_id_idx" ON "product_promotions"("product_id");
CREATE INDEX "product_promotions_ends_on_idx" ON "product_promotions"("ends_on");

ALTER TABLE "product_promotions" ADD CONSTRAINT "product_promotions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_promotions" ADD CONSTRAINT "product_promotions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
