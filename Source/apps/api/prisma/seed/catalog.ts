// Catalog part of the demo seed: categories, products, sale units, prices and opening stock.
// Prices and stock go through a COMMITTED import batch, exactly like a real Excel import
// would (RG-IMP-04, RG-ART-07): price rows with source IMPORT, one IMPORT movement per product.

import type { Db } from '../../src/db.js';
import type { DemoProduct } from './data.js';

const SEED_FILE_NAME = 'seed-demo.xlsx';

export interface SeedCatalogInput {
  categories: { name: string; maxDiscountPct?: string }[];
  products: DemoProduct[];
  /** Username of the manager recorded as importer and price setter. */
  importedBy: string;
}

export async function seedCatalog(db: Db, input: SeedCatalogInput): Promise<void> {
  const importer = await db.user.findUniqueOrThrow({ where: { username: input.importedBy } });

  const categoryIds = new Map<string, string>();
  for (const category of input.categories) {
    const row = await db.category.upsert({
      where: { name: category.name },
      create: { name: category.name, maxDiscountPct: category.maxDiscountPct ?? null },
      update: {},
    });
    categoryIds.set(category.name, row.id);
  }

  // One committed batch carries every demo price and opening quantity; its presence
  // means the stock part already ran (the seed is idempotent, movements are append-only).
  let batch = await db.importBatch.findFirst({
    where: { fileName: SEED_FILE_NAME, status: 'COMMITTED' },
  });
  const firstRun = batch === null;
  batch ??= await db.importBatch.create({
    data: {
      filePath: `files/imports/${SEED_FILE_NAME}`,
      fileName: SEED_FILE_NAME,
      mode: 'ENTRY',
      status: 'COMMITTED',
      entryDate: new Date(),
      userId: importer.id,
      rowsTotal: input.products.reduce((n, p) => n + p.units.length, 0),
      rowsOk: input.products.reduce((n, p) => n + p.units.length, 0),
      committedAt: new Date(),
    },
  });

  for (const product of input.products) {
    const categoryId = categoryIds.get(product.category);
    if (!categoryId) throw new Error(`Unknown category ${product.category} for ${product.sku}`);

    const row = await db.product.upsert({
      where: { sku: product.sku },
      create: {
        sku: product.sku,
        name: product.name,
        categoryId,
        baseUnit: product.baseUnit,
        alertThreshold: product.alertThreshold ?? null,
        maxDiscountPct: product.maxDiscountPct ?? null,
      },
      update: {},
    });

    for (const unit of product.units) {
      const unitRow = await db.productUnit.upsert({
        where: { productId_label: { productId: row.id, label: unit.label } },
        create: {
          productId: row.id,
          label: unit.label,
          factor: unit.factor,
          isBase: unit.isBase ?? false,
          barcode: unit.barcode ?? null,
          maxDiscountPct: unit.maxDiscountPct ?? null,
        },
        update: {},
      });

      const current = await db.productPrice.findFirst({
        where: { productUnitId: unitRow.id, effectiveTo: null },
      });
      if (!current) {
        await db.productPrice.create({
          data: {
            productUnitId: unitRow.id,
            price: unit.price,
            source: 'IMPORT',
            importBatchId: batch.id,
            setById: importer.id,
          },
        });
      }
    }

    if (firstRun && product.stock !== '0') {
      // Opening stock: movement + stock row in the same transaction (CDC technique §5).
      await db.$transaction([
        db.stockMovement.create({
          data: {
            productId: row.id,
            type: 'IMPORT',
            qty: product.stock,
            unitQty: product.stock,
            productUnitId: null,
            importBatchId: batch.id,
            entryDate: batch.entryDate,
            userId: importer.id,
          },
        }),
        db.productStock.upsert({
          where: { productId: row.id },
          create: { productId: row.id, onHand: product.stock },
          update: { onHand: { increment: product.stock } },
        }),
        db.product.update({ where: { id: row.id }, data: { lastEntryAt: new Date() } }),
      ]);
    } else {
      await db.productStock.upsert({
        where: { productId: row.id },
        create: { productId: row.id },
        update: {},
      });
    }
  }
}
