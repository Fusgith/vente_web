import { CATEGORIES, PRODUCTS } from '../prisma/seed/data.js';
import { seedCatalog } from '../prisma/seed/catalog.js';
import type { Db } from '../src/db.js';
import type { OrderStatus } from '../src/generated/prisma/enums.js';
import { createUser } from './helpers.js';

/**
 * The demo catalog of the seed (4 categories, 9 products, prices and opening stock through a
 * committed import), imported by a manager `responsable`. Returns that manager's id.
 */
export async function seedDemoCatalog(db: Db): Promise<{ managerId: string }> {
  const manager = await createUser(db, {
    username: 'responsable',
    roles: ['manager'],
    pin: '1234',
  });
  await seedCatalog(db, { categories: CATEGORIES, products: PRODUCTS, importedBy: 'responsable' });
  return { managerId: manager.id };
}

export async function productId(db: Db, sku: string): Promise<string> {
  return (await db.product.findUniqueOrThrow({ where: { sku }, select: { id: true } })).id;
}

export async function unitId(db: Db, sku: string, label: string): Promise<string> {
  const unit = await db.productUnit.findFirstOrThrow({
    where: { label, product: { sku } },
    select: { id: true },
  });
  return unit.id;
}

let orderCount = 0;

export interface SaleInput {
  salesUserId: string;
  status: OrderStatus;
  /** Days before now the order was validated. */
  daysAgo?: number;
  /** One line per product code, in its base unit, quantity 1. */
  skus: string[];
}

/** An order as T-032 will leave it: only what the favourites read is filled in. */
export async function recordSale(db: Db, input: SaleInput): Promise<void> {
  orderCount += 1;
  const customer = await db.customer.create({
    data: { name: `Client ${orderCount}`, phone: `034 00 ${String(orderCount).padStart(5, '0')}` },
  });
  const submittedAt = new Date(Date.now() - (input.daysAgo ?? 1) * 86_400_000);
  const lines = await Promise.all(
    input.skus.map(async (sku, position) => {
      const unit = await db.productUnit.findFirstOrThrow({
        where: { isBase: true, product: { sku } },
        include: { product: true },
      });
      return {
        position,
        productId: unit.productId,
        productUnitId: unit.id,
        sku,
        name: unit.product.name,
        unitLabel: unit.label,
        factor: unit.factor,
        qty: 1,
        baseQty: 1,
        unitPrice: 1000,
        lineTotal: 1000,
      };
    }),
  );
  await db.order.create({
    data: {
      number: `T-${orderCount}`,
      status: input.status,
      salesUserId: input.salesUserId,
      customerId: customer.id,
      submittedAt: input.status === 'DRAFT' ? null : submittedAt,
      lines: { create: lines },
    },
  });
}
