import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  ImportBatch,
  ImportCommit,
  ImportDetail,
  ImportLine,
  ImportList,
  ImportTotals,
  ImportUpload,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { Prisma, type ImportMode } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';
import { readImportFile, type RawRow } from './import-file.js';
import { planImport, type ProductPlan } from './import-plan.js';

type Tx = Prisma.TransactionClient;
const { Decimal } = Prisma;

/** What a batch keeps to show and commit it: the rows as read, the lines as shown. */
interface Stored {
  rows: RawRow[];
  lines: ImportLine[];
}

const json = (value: unknown) => value as Prisma.InputJsonValue;
const NO_TOTALS: ImportTotals = {
  productsCreated: 0,
  productsUpdated: 0,
  unitsCreated: 0,
  qtyIn: '0.00',
  pricesChanged: 0,
};
const HISTORY = 50;

const batchSelect = {
  id: true,
  fileName: true,
  mode: true,
  status: true,
  entryDate: true,
  createdAt: true,
  committedAt: true,
  rowsTotal: true,
  rowsOk: true,
  rowsError: true,
  summary: true,
  user: { select: { fullName: true } },
} satisfies Prisma.ImportBatchSelect;

function toBatch(row: Prisma.ImportBatchGetPayload<{ select: typeof batchSelect }>): ImportBatch {
  return {
    id: row.id,
    fileName: row.fileName,
    mode: row.mode,
    status: row.status,
    entryDate: row.entryDate.toISOString().slice(0, 10),
    userName: row.user.fullName,
    createdAt: row.createdAt.toISOString(),
    committedAt: row.committedAt?.toISOString() ?? null,
    rowsTotal: row.rowsTotal,
    rowsOk: row.rowsOk,
    rowsError: row.rowsError,
    totals: (row.summary as ImportTotals | null) ?? NO_TOTALS,
  };
}

/** The history, newest first (RG-IMP-06). */
export async function listImports(db: Db): Promise<ImportList> {
  const rows = await db.importBatch.findMany({
    orderBy: { createdAt: 'desc' },
    take: HISTORY,
    select: batchSelect,
  });
  return { items: rows.map(toBatch) };
}

export async function loadImport(db: Db, id: string): Promise<ImportDetail> {
  const row = await db.importBatch.findUnique({
    where: { id },
    select: { ...batchSelect, preview: true },
  });
  if (!row) throw new AppError(404, 'NOT_FOUND');
  return { ...toBatch(row), lines: (row.preview as unknown as Stored | null)?.lines ?? [] };
}

/** A stocktake replaces the stock: the manager's alone (RG-IMP-02, RG-IMP-08). */
function mayRun(actor: Actor, mode: ImportMode) {
  if (mode === 'STOCKTAKE' && actor.activeRole !== 'manager') {
    throw new AppError(403, 'AUTH_FORBIDDEN');
  }
}

/**
 * Upload (RG-IMP-04, step 1 and 2): the file read and kept under `imports/<batch>/`, the batch
 * recorded as a preview — nothing touches the catalog or the stock yet.
 */
export async function uploadImport(
  db: Db,
  filesDir: string,
  actor: Actor,
  input: ImportUpload,
): Promise<string> {
  mayRun(actor, input.mode);
  const content = Buffer.from(input.content, 'base64');
  const rows = await readImportFile(input.fileName, content);
  const plan = await planImport(db, rows, input.mode);
  const batch = await db.importBatch.create({
    data: {
      filePath: '',
      fileName: input.fileName,
      mode: input.mode,
      entryDate: new Date(`${input.entryDate}T00:00:00Z`),
      userId: actor.userId,
      rowsTotal: rows.length,
      rowsOk: plan.rowsOk,
      rowsError: plan.rowsError,
      preview: json({ rows, lines: plan.lines } satisfies Stored),
      summary: json(plan.totals),
    },
    select: { id: true },
  });
  const safeName = path.basename(input.fileName).replace(/[^\p{L}\p{N}._ -]/gu, '_');
  const filePath = path.posix.join('imports', batch.id, safeName);
  await mkdir(path.resolve(filesDir, 'imports', batch.id), { recursive: true });
  await writeFile(path.resolve(filesDir, filePath), content);
  await db.importBatch.update({ where: { id: batch.id }, data: { filePath } });
  return batch.id;
}

/** RG-IMP-04 step 3: nothing recorded, the import kept as « annulé ». */
export async function cancelImport(db: Db, actor: Actor, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const done = await tx.importBatch.updateMany({
      where: { id, status: 'PREVIEW' },
      data: { status: 'CANCELLED' },
    });
    if (done.count === 0) {
      if ((await tx.importBatch.count({ where: { id } })) === 0) {
        throw new AppError(404, 'NOT_FOUND');
      }
      throw new AppError(409, 'IMPORT_CLOSED');
    }
    await recordAudit(tx, {
      ...by(actor),
      action: 'import.cancelled',
      entityType: 'import_batch',
      entityId: id,
      before: { status: 'PREVIEW' },
      after: { status: 'CANCELLED' },
    });
  });
}

interface Batch {
  id: string;
  mode: ImportMode;
  entryDate: Date;
  now: Date;
  /** Category ids by lower-case name, those created by this import included. */
  categories: Map<string, string>;
}

async function categoryId(tx: Tx, batch: Batch, name: string): Promise<string> {
  const key = name.toLowerCase();
  const known = batch.categories.get(key);
  if (known) return known;
  const found =
    (await tx.category.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    })) ?? (await tx.category.create({ data: { name }, select: { id: true } }));
  batch.categories.set(key, found.id);
  return found.id;
}

/** RG-IMP-03 for one code: the product, its units, new dated prices, then its stock. */
async function applyProduct(tx: Tx, actor: Actor, batch: Batch, plan: ProductPlan) {
  const category = plan.category ? await categoryId(tx, batch, plan.category) : undefined;
  const base = plan.units.find((unit) => unit.isBase);
  let productId = plan.existingId;
  if (productId) {
    await tx.product.update({
      where: { id: productId },
      data: {
        ...(plan.name ? { name: plan.name } : {}),
        ...(category ? { categoryId: category } : {}),
        ...(plan.threshold ? { alertThreshold: plan.threshold } : {}),
        ...(plan.active !== null ? { isActive: plan.active } : {}),
      },
    });
  } else {
    const created = await tx.product.create({
      data: {
        sku: plan.sku,
        name: plan.name ?? plan.sku,
        categoryId: category ?? null,
        baseUnit: base?.label ?? '',
        alertThreshold: plan.threshold,
        isActive: plan.active ?? true,
      },
      select: { id: true },
    });
    productId = created.id;
  }

  const unitIds = new Map<string, string>();
  for (const unit of plan.units) {
    let unitId = unit.existingId;
    if (!unitId) {
      const created = await tx.productUnit.create({
        data: {
          productId,
          label: unit.label,
          factor: unit.factor,
          isBase: unit.isBase,
          barcode: unit.barcode,
          isActive: unit.active ?? true,
        },
        select: { id: true },
      });
      unitId = created.id;
    } else if (unit.factorChanged || unit.barcode || unit.active !== null) {
      await tx.productUnit.update({
        where: { id: unitId },
        data: {
          ...(unit.factorChanged ? { factor: unit.factor } : {}),
          ...(unit.barcode ? { barcode: unit.barcode } : {}),
          ...(unit.active !== null ? { isActive: unit.active } : {}),
        },
      });
    }
    unitIds.set(unit.label, unitId);
    // A different price opens a new dated one from the validation (RG-ART-07, RG-IMP-07).
    if (unit.price) {
      await tx.productPrice.updateMany({
        where: { productUnitId: unitId, effectiveTo: null },
        data: { effectiveTo: batch.now },
      });
      await tx.productPrice.create({
        data: {
          productUnitId: unitId,
          price: unit.price,
          effectiveFrom: batch.now,
          source: 'IMPORT',
          importBatchId: batch.id,
          setById: actor.userId,
        },
      });
    }
  }

  const before = new Decimal(plan.stockBefore);
  const after = new Decimal(plan.stockAfter);
  const movement = { productId, importBatchId: batch.id, entryDate: batch.entryDate };
  if (batch.mode === 'ENTRY') {
    for (const unit of plan.units) {
      if (new Decimal(unit.baseQty).isZero()) continue;
      await tx.stockMovement.create({
        data: {
          ...movement,
          type: 'IMPORT',
          qty: unit.baseQty,
          productUnitId: unitIds.get(unit.label) ?? null,
          unitQty: unit.qty,
          userId: actor.userId,
        },
      });
    }
  } else if (!after.equals(before)) {
    // Each gap of the stocktake is one movement (RG-IMP-02).
    await tx.stockMovement.create({
      data: {
        ...movement,
        type: 'STOCKTAKE',
        qty: after.minus(before),
        userId: actor.userId,
        reason: 'Inventaire',
      },
    });
  }
  if (!after.equals(before)) {
    await tx.productStock.upsert({
      where: { productId },
      create: { productId, onHand: after },
      update: { onHand: after },
    });
    if (batch.mode === 'ENTRY') {
      await tx.product.update({ where: { id: productId }, data: { lastEntryAt: batch.entryDate } });
    }
  }

  await recordAudit(tx, {
    ...by(actor),
    action: 'product.imported',
    entityType: 'product',
    entityId: productId,
    ...(plan.existingId ? { before: { onHand: plan.stockBefore } } : {}),
    after: {
      sku: plan.sku,
      created: plan.existingId === null,
      mode: batch.mode,
      onHand: plan.stockAfter,
      importBatchId: batch.id,
      units: plan.units.map((unit) => ({
        unit: unit.label,
        factor: unit.factor,
        qty: unit.qty,
        price: unit.price,
      })),
    },
  });
}

/**
 * RG-IMP-04 step 4, RG-IMP-05: planned again on the locked stock (the base may have moved since
 * the preview), then recorded in one transaction — every line, or the valid ones only.
 */
export async function commitImport(
  db: Db,
  actor: Actor,
  id: string,
  input: ImportCommit,
): Promise<void> {
  await db.$transaction(
    async (tx) => {
      // The batch locked: two validations at once never import twice.
      const [locked] = await tx.$queryRaw<{ status: string }[]>`
        SELECT "status"::text AS "status" FROM "import_batches" WHERE "id" = ${id}::uuid FOR UPDATE`;
      if (!locked) throw new AppError(404, 'NOT_FOUND');
      if (locked.status !== 'PREVIEW') throw new AppError(409, 'IMPORT_CLOSED');
      const batch = await tx.importBatch.findUniqueOrThrow({
        where: { id },
        select: { mode: true, entryDate: true, fileName: true, preview: true },
      });
      mayRun(actor, batch.mode);
      const { rows } = batch.preview as unknown as Stored;
      const plan = await planImport(tx, rows, batch.mode, true);
      if ((plan.rowsError > 0 && !input.validOnly) || plan.products.length === 0) {
        throw new AppError(409, 'IMPORT_HAS_ERRORS');
      }
      const now = new Date();
      const context: Batch = {
        id,
        mode: batch.mode,
        entryDate: batch.entryDate,
        now,
        categories: new Map(),
      };
      for (const product of plan.products) await applyProduct(tx, actor, context, product);
      await tx.importBatch.update({
        where: { id },
        data: {
          status: 'COMMITTED',
          committedAt: now,
          rowsOk: plan.rowsOk,
          rowsError: plan.rowsError,
          summary: json(plan.totals),
          preview: json({ rows, lines: plan.lines } satisfies Stored),
        },
      });
      await recordAudit(tx, {
        ...by(actor),
        action: 'import.committed',
        entityType: 'import_batch',
        entityId: id,
        before: { status: 'PREVIEW' },
        after: {
          status: 'COMMITTED',
          fileName: batch.fileName,
          mode: batch.mode,
          validOnly: input.validOnly,
          rowsOk: plan.rowsOk,
          rowsError: plan.rowsError,
          ...plan.totals,
        },
      });
    },
    { timeout: 120_000 },
  );
}
