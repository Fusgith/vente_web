-- Device pairing for the shop's stations (T-015, RG-USR-09, H71): the device keeps a random key,
-- the server only its sha256; one device per station.
ALTER TABLE "stations" ADD COLUMN "pairing_hash" VARCHAR(64),
    ADD COLUMN "paired_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX "stations_pairing_hash_key" ON "stations"("pairing_hash");
