-- The usual payment methods (RG-PAY-01) came only from the demo seed: a shop's fresh database
-- needs them too (T-080). Same codes, labels and order as the seed; existing rows are kept.
INSERT INTO "payment_methods" ("id", "code", "label", "requires_reference", "is_active", "sort_order")
VALUES (gen_random_uuid(), 'CASH', 'Espèces', false, true, 1),
       (gen_random_uuid(), 'MVOLA', 'MVola', true, true, 2),
       (gen_random_uuid(), 'ORANGE_MONEY', 'Orange Money', true, true, 3),
       (gen_random_uuid(), 'AIRTEL_MONEY', 'Airtel Money', true, true, 4),
       (gen_random_uuid(), 'CARD', 'Carte bancaire', true, true, 5),
       (gen_random_uuid(), 'TRANSFER', 'Virement', true, true, 6),
       (gen_random_uuid(), 'CHEQUE', 'Chèque', true, true, 7)
ON CONFLICT ("code") DO NOTHING;
