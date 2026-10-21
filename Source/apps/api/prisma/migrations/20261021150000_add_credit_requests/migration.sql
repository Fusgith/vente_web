-- T-095b (H67, H76): credit refused by the conditions, asked of the owner at the register.
CREATE TYPE "credit_request_status" AS ENUM ('PENDING', 'GRANTED', 'REJECTED');

CREATE TABLE "credit_requests" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "refusal" VARCHAR(20) NOT NULL,
    "outstanding" DECIMAL(14,2) NOT NULL,
    "days" INTEGER,
    "status" "credit_request_status" NOT NULL DEFAULT 'PENDING',
    "requested_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credit_requests_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "credit_requests_days_range" CHECK ("days" BETWEEN 1 AND 365)
);
CREATE INDEX "credit_requests_status_created_at_idx" ON "credit_requests"("status", "created_at");
CREATE INDEX "credit_requests_order_id_idx" ON "credit_requests"("order_id");
-- One request waiting per order.
CREATE UNIQUE INDEX "credit_requests_one_pending" ON "credit_requests"("order_id") WHERE "status" = 'PENDING';

ALTER TABLE "credit_requests" ADD CONSTRAINT "credit_requests_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_requests" ADD CONSTRAINT "credit_requests_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_requests" ADD CONSTRAINT "credit_requests_requested_by_fkey"
  FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_requests" ADD CONSTRAINT "credit_requests_decided_by_fkey"
  FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
