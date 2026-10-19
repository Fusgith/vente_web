-- T-095 (H67): credit sale. The owner sets credit conditions (customer type, category or one
-- customer); a sale partly on credit leaves a receivable due on a day, settled later at the register.
CREATE TYPE "receivable_status" AS ENUM ('OPEN', 'SETTLED');

CREATE TABLE "credit_conditions" (
    "id" UUID NOT NULL,
    "customer_type" "customer_type",
    "customer_category" VARCHAR(40),
    "customer_id" UUID,
    "ceiling" DECIMAL(14,2) NOT NULL,
    "days" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "credit_conditions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credit_conditions_one_scope" CHECK (num_nonnulls("customer_type", "customer_category", "customer_id") = 1),
    CONSTRAINT "credit_conditions_ceiling_positive" CHECK ("ceiling" > 0),
    CONSTRAINT "credit_conditions_days_range" CHECK ("days" BETWEEN 1 AND 365)
);
CREATE UNIQUE INDEX "credit_conditions_customer_type_key" ON "credit_conditions"("customer_type");
CREATE UNIQUE INDEX "credit_conditions_customer_category_key" ON "credit_conditions"("customer_category");
CREATE UNIQUE INDEX "credit_conditions_customer_id_key" ON "credit_conditions"("customer_id");
ALTER TABLE "credit_conditions" ADD CONSTRAINT "credit_conditions_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "receivables" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "due_on" DATE NOT NULL,
    "status" "receivable_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receivables_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "receivables_paid_range" CHECK ("amount" > 0 AND "paid" >= 0 AND "paid" <= "amount")
);
CREATE UNIQUE INDEX "receivables_invoice_id_key" ON "receivables"("invoice_id");
CREATE INDEX "receivables_customer_id_status_idx" ON "receivables"("customer_id", "status");
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "receivable_settlements" (
    "id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "year" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "receivable_id" UUID NOT NULL,
    "method_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" VARCHAR(80),
    "register_session_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "pdf_path" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receivable_settlements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "receivable_settlements_amount_positive" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "receivable_settlements_number_key" ON "receivable_settlements"("number");
CREATE UNIQUE INDEX "receivable_settlements_year_seq_key" ON "receivable_settlements"("year", "seq");
CREATE INDEX "receivable_settlements_receivable_id_idx" ON "receivable_settlements"("receivable_id");
CREATE INDEX "receivable_settlements_register_session_id_idx" ON "receivable_settlements"("register_session_id");
ALTER TABLE "receivable_settlements" ADD CONSTRAINT "receivable_settlements_receivable_id_fkey"
  FOREIGN KEY ("receivable_id") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivable_settlements" ADD CONSTRAINT "receivable_settlements_method_id_fkey"
  FOREIGN KEY ("method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivable_settlements" ADD CONSTRAINT "receivable_settlements_register_session_id_fkey"
  FOREIGN KEY ("register_session_id") REFERENCES "register_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivable_settlements" ADD CONSTRAINT "receivable_settlements_cashier_id_fkey"
  FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The credit part of a payment is one of its lines (RG-PAY-02, H67), last in the list.
INSERT INTO "payment_methods" ("id", "code", "label", "requires_reference", "is_active", "sort_order")
VALUES (gen_random_uuid(), 'CREDIT', 'À crédit', false, true, 8)
ON CONFLICT ("code") DO NOTHING;
