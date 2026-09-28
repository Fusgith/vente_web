-- T-061 delivery issues and partial credit (RG-LIV-04, RG-ANN-03, ⚠️ H37): what a warehouse user
-- could not hand over, why, and the manager's decision; the credit frozen at the partial delivery.
CREATE TYPE "issue_cause" AS ENUM ('MISSING', 'DAMAGED');
CREATE TYPE "issue_resolution" AS ENUM ('REQUEUED', 'PARTLY_DELIVERED');

CREATE TABLE "delivery_issues" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "reported_by" UUID NOT NULL,
  "reported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" VARCHAR(300),
  "resolution" "issue_resolution",
  "decided_by" UUID,
  "decided_at" TIMESTAMPTZ(6),
  "credit_amount" DECIMAL(14,2),
  "credit_note_id" UUID,
  CONSTRAINT "delivery_issues_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_issues_decided_check" CHECK (
    ("resolution" IS NULL) = ("decided_by" IS NULL) AND ("resolution" IS NULL) = ("decided_at" IS NULL)
  ),
  -- A credit only for a partial delivery, never negative; a credit note only for a credit.
  CONSTRAINT "delivery_issues_credit_check" CHECK (
    ("credit_amount" IS NOT NULL) = ("resolution" IS NOT DISTINCT FROM 'PARTLY_DELIVERED')
    AND ("credit_amount" IS NULL OR "credit_amount" >= 0)
    AND ("credit_note_id" IS NULL OR "credit_amount" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "delivery_issues_credit_note_id_key" ON "delivery_issues"("credit_note_id");
CREATE INDEX "delivery_issues_order_id_idx" ON "delivery_issues"("order_id");
-- One open issue per order: the manager decides before another can be reported.
CREATE UNIQUE INDEX "delivery_issues_open_key" ON "delivery_issues"("order_id") WHERE "resolution" IS NULL;
ALTER TABLE "delivery_issues" ADD CONSTRAINT "delivery_issues_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_issues" ADD CONSTRAINT "delivery_issues_reported_by_fkey"
  FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_issues" ADD CONSTRAINT "delivery_issues_decided_by_fkey"
  FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_issues" ADD CONSTRAINT "delivery_issues_credit_note_id_fkey"
  FOREIGN KEY ("credit_note_id") REFERENCES "credit_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "delivery_issue_lines" (
  "issue_id" UUID NOT NULL,
  "order_line_id" UUID NOT NULL,
  "qty" DECIMAL(12,2) NOT NULL,
  "cause" "issue_cause" NOT NULL,
  "credit_amount" DECIMAL(14,2),
  CONSTRAINT "delivery_issue_lines_pkey" PRIMARY KEY ("issue_id", "order_line_id"),
  CONSTRAINT "delivery_issue_lines_qty_check" CHECK ("qty" > 0),
  CONSTRAINT "delivery_issue_lines_credit_check" CHECK ("credit_amount" IS NULL OR "credit_amount" >= 0)
);
CREATE INDEX "delivery_issue_lines_order_line_id_idx" ON "delivery_issue_lines"("order_line_id");
ALTER TABLE "delivery_issue_lines" ADD CONSTRAINT "delivery_issue_lines_issue_id_fkey"
  FOREIGN KEY ("issue_id") REFERENCES "delivery_issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_issue_lines" ADD CONSTRAINT "delivery_issue_lines_order_line_id_fkey"
  FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
