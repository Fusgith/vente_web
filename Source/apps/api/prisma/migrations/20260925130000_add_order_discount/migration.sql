-- T-031 order discount (RG-REM-06, H23): discount on the subtotal, its code, and its share per line.

-- AlterTable
ALTER TABLE "order_lines" ADD COLUMN     "order_discount_share" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "order_discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "order_discount_code_id" UUID,
ADD COLUMN     "order_discount_pct" DECIMAL(5,2),
ADD COLUMN     "order_discount_source" "discount_source" NOT NULL DEFAULT 'NONE';

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_discount_code_id_fkey" FOREIGN KEY ("order_discount_code_id") REFERENCES "discount_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
