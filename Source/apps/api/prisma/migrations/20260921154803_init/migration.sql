-- CreateEnum
CREATE TYPE "price_source" AS ENUM ('IMPORT', 'MANUAL');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('ISSUED', 'CREDITED', 'PARTIALLY_CREDITED');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('DRAFT', 'SUBMITTED', 'AT_REGISTER', 'PAID', 'PREPARING', 'READY', 'ISSUE', 'DELIVERED', 'EXPIRED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "discount_source" AS ENUM ('NONE', 'WITHIN_CAP', 'CODE');

-- CreateEnum
CREATE TYPE "discount_request_status" AS ENUM ('PENDING', 'GRANTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "discount_code_status" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "movement_type" AS ENUM ('IMPORT', 'ADJUSTMENT', 'DELIVERY', 'RETURN', 'STOCKTAKE');

-- CreateEnum
CREATE TYPE "import_mode" AS ENUM ('ENTRY', 'STOCKTAKE');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('PREVIEW', 'COMMITTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "reservation_status" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "role" AS ENUM ('admin', 'manager', 'sales', 'cashier', 'warehouse', 'owner');

-- CreateEnum
CREATE TYPE "station_type" AS ENUM ('SALES', 'REGISTER', 'DELIVERY', 'DISPLAY');

-- CreateEnum
CREATE TYPE "session_origin" AS ENUM ('LAN', 'REMOTE');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "max_discount_pct" DECIMAL(5,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category_id" UUID,
    "base_unit" VARCHAR(20) NOT NULL,
    "max_discount_pct" DECIMAL(5,2),
    "alert_threshold" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_entry_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_units" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "factor" DECIMAL(12,3) NOT NULL,
    "is_base" BOOLEAN NOT NULL DEFAULT false,
    "barcode" VARCHAR(64),
    "max_discount_pct" DECIMAL(5,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_prices" (
    "id" UUID NOT NULL,
    "product_unit_id" UUID NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(6),
    "source" "price_source" NOT NULL,
    "import_batch_id" UUID,
    "set_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_stock" (
    "product_id" UUID NOT NULL,
    "on_hand" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_stock_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "register_sessions" (
    "id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opening_float" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "closed_at" TIMESTAMPTZ(6),
    "counted_cash" DECIMAL(14,2),
    "expected_by_method" JSONB,
    "variance" DECIMAL(14,2),
    "note" TEXT,
    "validated_by" UUID,

    CONSTRAINT "register_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "requires_reference" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "invoice_id" UUID,
    "register_session_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "total_due" DECIMAL(14,2) NOT NULL,
    "cash_received" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "change_given" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_lines" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "method_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" VARCHAR(80),

    CONSTRAINT "payment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "key" VARCHAR(32) NOT NULL,
    "next_value" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "year" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "order_id" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB NOT NULL,
    "pdf_path" TEXT,
    "status" "invoice_status" NOT NULL DEFAULT 'ISSUED',

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "refund_method_id" UUID,
    "refund_reference" VARCHAR(80),
    "issued_by" UUID NOT NULL,
    "approved_by" UUID,
    "pdf_path" TEXT,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "merged_into_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'DRAFT',
    "sales_user_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "ticket_letter" CHAR(1),
    "ticket_seq" INTEGER,
    "ticket_date" DATE,
    "queue_rank" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "no_show_count" INTEGER NOT NULL DEFAULT 0,
    "register_station_id" UUID,
    "cashier_user_id" UUID,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vat_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "rounding" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6),
    "submitted_at" TIMESTAMPTZ(6),
    "called_at" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "ready_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "product_id" UUID NOT NULL,
    "product_unit_id" UUID NOT NULL,
    "product_price_id" UUID,
    "sku" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "unit_label" VARCHAR(40) NOT NULL,
    "factor" DECIMAL(12,3) NOT NULL,
    "qty" DECIMAL(12,2) NOT NULL,
    "base_qty" DECIMAL(12,2) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "max_discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_source" "discount_source" NOT NULL DEFAULT 'NONE',
    "discount_code_id" UUID,
    "line_total" DECIMAL(14,2) NOT NULL,
    "delivered_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_requests" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "line_id" UUID,
    "customer_id" UUID,
    "requested_pct" DECIMAL(5,2),
    "requested_amount" DECIMAL(14,2),
    "reason" TEXT NOT NULL,
    "status" "discount_request_status" NOT NULL DEFAULT 'PENDING',
    "requested_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_pct" DECIMAL(5,2),
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_codes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "pct" DECIMAL(5,2),
    "amount" DECIMAL(14,2),
    "order_id" UUID,
    "customer_id" UUID,
    "request_id" UUID,
    "issued_by" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "discount_code_status" NOT NULL DEFAULT 'ACTIVE',
    "used_at" TIMESTAMPTZ(6),
    "used_on_order_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "discount_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "type" "movement_type" NOT NULL,
    "qty" DECIMAL(12,2) NOT NULL,
    "product_unit_id" UUID,
    "unit_qty" DECIMAL(12,2),
    "import_batch_id" UUID,
    "entry_date" DATE,
    "order_id" UUID,
    "user_id" UUID NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty" DECIMAL(12,2) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "status" "reservation_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mode" "import_mode" NOT NULL,
    "status" "import_status" NOT NULL DEFAULT 'PREVIEW',
    "entry_date" DATE NOT NULL,
    "user_id" UUID NOT NULL,
    "rows_total" INTEGER NOT NULL DEFAULT 0,
    "rows_ok" INTEGER NOT NULL DEFAULT 0,
    "rows_error" INTEGER NOT NULL DEFAULT 0,
    "preview" JSONB,
    "summary" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" TIMESTAMPTZ(6),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "warehouse_user_id" UUID NOT NULL,
    "station_id" UUID,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "issue_note" TEXT,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID,
    "active_role" "role",
    "station_id" UUID,
    "origin" "session_origin",
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" VARCHAR(64),
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" VARCHAR(64) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "roles" "role"[],
    "pin_hash" TEXT,
    "password_hash" TEXT,
    "totp_secret" TEXT,
    "ticket_letter" CHAR(1),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stations" (
    "id" UUID NOT NULL,
    "type" "station_type" NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "display_key" VARCHAR(64),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "active_role" "role" NOT NULL,
    "station_id" UUID,
    "origin" "session_origin" NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE UNIQUE INDEX "product_units_barcode_key" ON "product_units"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "product_units_product_id_label_key" ON "product_units"("product_id", "label");

-- CreateIndex
CREATE INDEX "product_prices_product_unit_id_effective_from_idx" ON "product_prices"("product_unit_id", "effective_from" DESC);

-- CreateIndex
CREATE INDEX "register_sessions_cashier_id_opened_at_idx" ON "register_sessions"("cashier_id", "opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_code_key" ON "payment_methods"("code");

-- CreateIndex
CREATE UNIQUE INDEX "payments_invoice_id_key" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_register_session_id_idx" ON "payments"("register_session_id");

-- CreateIndex
CREATE INDEX "payment_lines_payment_id_idx" ON "payment_lines"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_order_id_key" ON "invoices"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_year_seq_key" ON "invoices"("year", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_number_key" ON "credit_notes"("number");

-- CreateIndex
CREATE INDEX "credit_notes_invoice_id_idx" ON "credit_notes"("invoice_id");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE INDEX "orders_status_queue_rank_idx" ON "orders"("status", "queue_rank");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "orders_sales_user_id_created_at_idx" ON "orders"("sales_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_ticket_date_ticket_letter_ticket_seq_key" ON "orders"("ticket_date", "ticket_letter", "ticket_seq");

-- CreateIndex
CREATE INDEX "order_lines_order_id_idx" ON "order_lines"("order_id");

-- CreateIndex
CREATE INDEX "order_lines_product_id_idx" ON "order_lines"("product_id");

-- CreateIndex
CREATE INDEX "discount_requests_status_created_at_idx" ON "discount_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "discount_requests_order_id_idx" ON "discount_requests"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "discount_codes_code_key" ON "discount_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "discount_codes_request_id_key" ON "discount_codes"("request_id");

-- CreateIndex
CREATE INDEX "discount_codes_status_expires_at_idx" ON "discount_codes"("status", "expires_at");

-- CreateIndex
CREATE INDEX "stock_movements_product_id_created_at_idx" ON "stock_movements"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_import_batch_id_idx" ON "stock_movements"("import_batch_id");

-- CreateIndex
CREATE INDEX "stock_movements_order_id_idx" ON "stock_movements"("order_id");

-- CreateIndex
CREATE INDEX "reservations_order_id_idx" ON "reservations"("order_id");

-- CreateIndex
CREATE INDEX "reservations_status_expires_at_idx" ON "reservations"("status", "expires_at");

-- CreateIndex
CREATE INDEX "import_batches_status_created_at_idx" ON "import_batches"("status", "created_at");

-- CreateIndex
CREATE INDEX "deliveries_order_id_idx" ON "deliveries"("order_id");

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_user_id_at_idx" ON "audit_log"("user_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "stations_display_key_key" ON "stations"("display_key");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_set_by_fkey" FOREIGN KEY ("set_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "register_sessions" ADD CONSTRAINT "register_sessions_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "register_sessions" ADD CONSTRAINT "register_sessions_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "register_sessions" ADD CONSTRAINT "register_sessions_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_register_session_id_fkey" FOREIGN KEY ("register_session_id") REFERENCES "register_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_method_id_fkey" FOREIGN KEY ("method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_refund_method_id_fkey" FOREIGN KEY ("refund_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sales_user_id_fkey" FOREIGN KEY ("sales_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cashier_user_id_fkey" FOREIGN KEY ("cashier_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_register_station_id_fkey" FOREIGN KEY ("register_station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_price_id_fkey" FOREIGN KEY ("product_price_id") REFERENCES "product_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_discount_code_id_fkey" FOREIGN KEY ("discount_code_id") REFERENCES "discount_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_requests" ADD CONSTRAINT "discount_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_requests" ADD CONSTRAINT "discount_requests_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_requests" ADD CONSTRAINT "discount_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_requests" ADD CONSTRAINT "discount_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_requests" ADD CONSTRAINT "discount_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "discount_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_used_on_order_id_fkey" FOREIGN KEY ("used_on_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_warehouse_user_id_fkey" FOREIGN KEY ("warehouse_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===========================================================================
-- Hand-written part (CDC technique §5). Prisma cannot express partial or
-- expression indexes, CHECK constraints and triggers: they live here, and any
-- later migration touching these tables must keep them.
-- ===========================================================================

-- users: ticket letter unique among active sales users (RG-USR-07, RG-TKT-01);
-- username unique regardless of case.
ALTER TABLE "users"
  ADD CONSTRAINT "users_ticket_letter_check" CHECK ("ticket_letter" IS NULL OR "ticket_letter" ~ '^[A-Z]$');
CREATE UNIQUE INDEX "users_ticket_letter_active_sales_key" ON "users" ("ticket_letter")
  WHERE "is_active" AND 'sales' = ANY ("roles");
CREATE UNIQUE INDEX "users_username_lower_key" ON "users" (lower("username"));

-- stations: at most one active public display (H11).
CREATE UNIQUE INDEX "stations_single_active_display_key" ON "stations" ("type")
  WHERE "type" = 'DISPLAY' AND "is_active";

-- products: sku unique regardless of case (RG-ART-01).
CREATE UNIQUE INDEX "products_sku_lower_key" ON "products" (lower("sku"));
ALTER TABLE "products"
  ADD CONSTRAINT "products_max_discount_pct_check" CHECK ("max_discount_pct" IS NULL OR ("max_discount_pct" >= 0 AND "max_discount_pct" <= 100)),
  ADD CONSTRAINT "products_alert_threshold_check" CHECK ("alert_threshold" IS NULL OR "alert_threshold" >= 0);
ALTER TABLE "categories"
  ADD CONSTRAINT "categories_max_discount_pct_check" CHECK ("max_discount_pct" IS NULL OR ("max_discount_pct" >= 0 AND "max_discount_pct" <= 100));

-- product_units (RG-ART-06): factor > 0, the base unit has factor 1, exactly one base unit per product,
-- and the factor is frozen once an order line references the unit.
ALTER TABLE "product_units"
  ADD CONSTRAINT "product_units_factor_positive_check" CHECK ("factor" > 0),
  ADD CONSTRAINT "product_units_base_factor_one_check" CHECK (NOT "is_base" OR "factor" = 1),
  ADD CONSTRAINT "product_units_max_discount_pct_check" CHECK ("max_discount_pct" IS NULL OR ("max_discount_pct" >= 0 AND "max_discount_pct" <= 100));
CREATE UNIQUE INDEX "product_units_one_base_per_product_key" ON "product_units" ("product_id") WHERE "is_base";

CREATE FUNCTION product_units_freeze_factor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."factor" IS DISTINCT FROM OLD."factor"
     AND EXISTS (SELECT 1 FROM "order_lines" WHERE "product_unit_id" = OLD."id") THEN
    RAISE EXCEPTION 'product_units.factor is frozen once an order line references the unit (RG-ART-06)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "product_units_freeze_factor_trg"
  BEFORE UPDATE OF "factor" ON "product_units"
  FOR EACH ROW EXECUTE FUNCTION product_units_freeze_factor();

-- product_prices (RG-ART-07): append-only history, at most one current price per unit,
-- the only allowed update is closing a current price (effective_to NULL → value).
ALTER TABLE "product_prices"
  ADD CONSTRAINT "product_prices_price_check" CHECK ("price" >= 0),
  ADD CONSTRAINT "product_prices_period_check" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");
CREATE UNIQUE INDEX "product_prices_one_current_per_unit_key" ON "product_prices" ("product_unit_id")
  WHERE "effective_to" IS NULL;

CREATE FUNCTION product_prices_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'product_prices is append-only: DELETE is forbidden (RG-ART-07)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."effective_to" IS NOT NULL
     OR NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."product_unit_id" IS DISTINCT FROM OLD."product_unit_id"
     OR NEW."price" IS DISTINCT FROM OLD."price"
     OR NEW."effective_from" IS DISTINCT FROM OLD."effective_from"
     OR NEW."source" IS DISTINCT FROM OLD."source"
     OR NEW."import_batch_id" IS DISTINCT FROM OLD."import_batch_id"
     OR NEW."set_by" IS DISTINCT FROM OLD."set_by"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'product_prices rows never change except closing effective_to (RG-ART-07)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "product_prices_immutable_trg"
  BEFORE UPDATE OR DELETE ON "product_prices"
  FOR EACH ROW EXECUTE FUNCTION product_prices_immutable();

-- product_stock (RG-STK-01): one stock per product, in base unit.
ALTER TABLE "product_stock"
  ADD CONSTRAINT "product_stock_quantities_check"
    CHECK ("on_hand" >= 0 AND "reserved" >= 0 AND "reserved" <= "on_hand");

-- stock_movements: a movement never has a zero quantity.
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_qty_check" CHECK ("qty" <> 0);

-- reservations (RG-STK-02).
ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_qty_check" CHECK ("qty" > 0);

-- customers: phone unique among active customers (RG-DEV-04).
CREATE UNIQUE INDEX "customers_phone_active_key" ON "customers" ("phone") WHERE "is_active";

-- orders / order_lines (RG-CMD-*, RG-ART-06, RG-REM-01): base_qty computed once, caps in [0, 100].
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_ticket_check"
    CHECK (("ticket_letter" IS NULL) = ("ticket_seq" IS NULL) AND ("ticket_letter" IS NULL) = ("ticket_date" IS NULL)),
  ADD CONSTRAINT "orders_ticket_seq_check" CHECK ("ticket_seq" IS NULL OR "ticket_seq" >= 1),
  ADD CONSTRAINT "orders_version_check" CHECK ("version" >= 1);
ALTER TABLE "order_lines"
  ADD CONSTRAINT "order_lines_qty_check" CHECK ("qty" > 0 AND "factor" > 0 AND "base_qty" > 0),
  ADD CONSTRAINT "order_lines_base_qty_check" CHECK ("base_qty" = round("qty" * "factor", 2)),
  ADD CONSTRAINT "order_lines_pct_check"
    CHECK ("max_discount_pct" >= 0 AND "max_discount_pct" <= 100 AND "discount_pct" >= 0 AND "discount_pct" <= 100),
  ADD CONSTRAINT "order_lines_delivered_qty_check" CHECK ("delivered_qty" >= 0 AND "delivered_qty" <= "qty");

-- discount_requests: one PENDING request per order (RG-REM-03).
CREATE UNIQUE INDEX "discount_requests_one_pending_per_order_key" ON "discount_requests" ("order_id")
  WHERE "status" = 'PENDING';
ALTER TABLE "discount_requests"
  ADD CONSTRAINT "discount_requests_value_check"
    CHECK (("requested_pct" IS NOT NULL) OR ("requested_amount" IS NOT NULL)),
  ADD CONSTRAINT "discount_requests_pct_check"
    CHECK ("requested_pct" IS NULL OR ("requested_pct" > 0 AND "requested_pct" <= 100));

-- discount_codes (RG-REM-04): a code carries either a percentage or an amount.
ALTER TABLE "discount_codes"
  ADD CONSTRAINT "discount_codes_value_check" CHECK (("pct" IS NOT NULL) <> ("amount" IS NOT NULL)),
  ADD CONSTRAINT "discount_codes_pct_check" CHECK ("pct" IS NULL OR ("pct" > 0 AND "pct" <= 100)),
  ADD CONSTRAINT "discount_codes_amount_check" CHECK ("amount" IS NULL OR "amount" > 0),
  ADD CONSTRAINT "discount_codes_expiry_check" CHECK ("expires_at" > "issued_at");

-- register_sessions: one open session per cashier (RG-CAI-01).
CREATE UNIQUE INDEX "register_sessions_one_open_per_cashier_key" ON "register_sessions" ("cashier_id")
  WHERE "closed_at" IS NULL;

-- payments / invoices / credit notes (RG-PAY-*, RG-FAC-01).
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amounts_check"
    CHECK ("total_due" >= 0 AND "cash_received" >= 0 AND "change_given" >= 0);
ALTER TABLE "payment_lines"
  ADD CONSTRAINT "payment_lines_amount_check" CHECK ("amount" > 0);
ALTER TABLE "number_sequences"
  ADD CONSTRAINT "number_sequences_next_value_check" CHECK ("next_value" >= 1);
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_seq_check" CHECK ("seq" >= 1 AND "year" >= 2000);
ALTER TABLE "credit_notes"
  ADD CONSTRAINT "credit_notes_amount_check" CHECK ("amount" > 0);

-- ---------------------------------------------------------------------------
-- Immutability (RG-AUD-01, CDC technique §5). Enforced by triggers whatever the
-- SQL role; the application role additionally loses UPDATE/DELETE rights at
-- deployment (T-014 / T-080). Corrections are compensating writes.
-- ---------------------------------------------------------------------------
CREATE FUNCTION forbid_row_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is forbidden (RG-AUD-01)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER "audit_log_append_only_trg"
  BEFORE UPDATE OR DELETE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION forbid_row_change();
CREATE TRIGGER "stock_movements_append_only_trg"
  BEFORE UPDATE OR DELETE ON "stock_movements" FOR EACH ROW EXECUTE FUNCTION forbid_row_change();
CREATE TRIGGER "payments_append_only_trg"
  BEFORE UPDATE OR DELETE ON "payments" FOR EACH ROW EXECUTE FUNCTION forbid_row_change();
CREATE TRIGGER "payment_lines_append_only_trg"
  BEFORE UPDATE OR DELETE ON "payment_lines" FOR EACH ROW EXECUTE FUNCTION forbid_row_change();

-- invoices: nothing changes after issue except status and the stored PDF path (RG-FAC-01/02).
CREATE FUNCTION invoices_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invoices are never deleted (RG-FAC-01)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."number" IS DISTINCT FROM OLD."number"
     OR NEW."year" IS DISTINCT FROM OLD."year"
     OR NEW."seq" IS DISTINCT FROM OLD."seq"
     OR NEW."order_id" IS DISTINCT FROM OLD."order_id"
     OR NEW."issued_at" IS DISTINCT FROM OLD."issued_at"
     OR NEW."snapshot" IS DISTINCT FROM OLD."snapshot" THEN
    RAISE EXCEPTION 'invoices never change after issue, except status and pdf_path (RG-FAC-01)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "invoices_immutable_trg"
  BEFORE UPDATE OR DELETE ON "invoices" FOR EACH ROW EXECUTE FUNCTION invoices_immutable();

-- credit_notes: same rule, only pdf_path may be filled in after issue (RG-FAC-05).
CREATE FUNCTION credit_notes_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'credit_notes are never deleted (RG-FAC-05)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."number" IS DISTINCT FROM OLD."number"
     OR NEW."invoice_id" IS DISTINCT FROM OLD."invoice_id"
     OR NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."reason" IS DISTINCT FROM OLD."reason"
     OR NEW."refund_method_id" IS DISTINCT FROM OLD."refund_method_id"
     OR NEW."refund_reference" IS DISTINCT FROM OLD."refund_reference"
     OR NEW."issued_by" IS DISTINCT FROM OLD."issued_by"
     OR NEW."approved_by" IS DISTINCT FROM OLD."approved_by"
     OR NEW."issued_at" IS DISTINCT FROM OLD."issued_at" THEN
    RAISE EXCEPTION 'credit_notes never change after issue, except pdf_path (RG-FAC-05)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "credit_notes_immutable_trg"
  BEFORE UPDATE OR DELETE ON "credit_notes" FOR EACH ROW EXECUTE FUNCTION credit_notes_immutable();
