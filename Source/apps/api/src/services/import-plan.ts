import {
  baseQuantity,
  IMPORT_PRICE_JUMP_PCT,
  IMPORT_TYPE_PRICE_COLUMNS,
  MAX_ACTIVE_UNITS,
  priceChangePct,
  type CustomerType,
  type ImportLine,
  type ImportMode,
  type ImportTotals,
} from '@vente-web/shared';

import { Prisma } from '../generated/prisma/client.js';
import type { RawRow } from './import-file.js';

type Tx = Prisma.TransactionClient;
const { Decimal } = Prisma;

const QTY = /^\d{1,10}(\.\d{1,2})?$/;
const FACTOR = /^\d{1,9}(\.\d{1,3})?$/;
const PRICE = /^\d{1,12}(\.\d{1,2})?$/;
/** « 1 250,5 » → `1250.5`: spaces of thousands and the French decimal comma accepted. */
const typed = (value: string | undefined) => (value ?? '').replace(/\s/g, '').replace(',', '.');
/** The column widths of the catalog (`catalog.prisma`); the base unit label is also `base_unit`. */
const MAX_LENGTH: Record<string, number> = {
  code: 64,
  designation: 200,
  categorie: 80,
  code_barres: 64,
};
const MAX_UNIT = 40;
const MAX_BASE_UNIT = 20;

export interface UnitPlan {
  label: string;
  factor: string;
  isBase: boolean;
  existingId: string | null;
  factorChanged: boolean;
  barcode: string | null;
  /** OUI / NON on a line other than the base one (annexe A); null = unchanged. */
  active: boolean | null;
  qty: string;
  baseQty: string;
  /** The new price when it differs from the one in force. */
  price: string | null;
  /** The new prices of customer types that differ from the ones in force (H66). */
  typePrices: Partial<Record<CustomerType, string>>;
}

export interface ProductPlan {
  existingId: string | null;
  sku: string;
  name: string | null;
  category: string | null;
  threshold: string | null;
  /** OUI / NON on the base unit line: the product itself. */
  active: boolean | null;
  stockBefore: string;
  stockAfter: string;
  units: UnitPlan[];
}

export interface ImportPlan {
  lines: ImportLine[];
  /** The products whose every line is valid, in file order. */
  products: ProductPlan[];
  totals: ImportTotals;
  rowsOk: number;
  rowsError: number;
}

type Existing = Awaited<ReturnType<typeof loadExisting>>[number];

/** The products the file names, their units, current prices and stock — locked when committing. */
async function loadExisting(tx: Tx, skus: string[], lock: boolean) {
  const found = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "products" WHERE lower("sku") = ANY(${skus}::text[])`;
  const ids = found.map((row) => row.id);
  if (lock && ids.length > 0) {
    // An order validated meanwhile waits for the import, then sees the new stock.
    await tx.$queryRaw`
      SELECT "product_id" FROM "product_stock" WHERE "product_id" = ANY(${ids}::uuid[]) FOR UPDATE`;
  }
  return tx.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      sku: true,
      stock: { select: { onHand: true, reserved: true } },
      units: {
        select: {
          id: true,
          label: true,
          factor: true,
          isBase: true,
          isActive: true,
          prices: { where: { effectiveTo: null }, select: { price: true, customerType: true } },
          _count: { select: { orderLines: true } },
        },
      },
    },
  });
}

function blankLine(raw: RawRow, existing: Existing | undefined): ImportLine {
  return {
    row: raw.row,
    sku: raw.cells.code ?? '',
    unit: raw.cells.unite ?? '',
    product: raw.cells.code ? (existing ? 'update' : 'create') : null,
    unitAction: null,
    qty: null,
    baseQty: null,
    stockBefore: null,
    stockAfter: null,
    priceBefore: null,
    price: null,
    errors: raw.cells.code ? [] : ['CODE_MISSING'],
    warnings: [],
  };
}

interface Context {
  mode: ImportMode;
  categories: Set<string>;
  /** Barcode → the unit holding it in the base. */
  barcodes: Map<string, string>;
  /** Barcode → how many lines of the file carry it. */
  fileBarcodes: Map<string, number>;
}

/** One code's lines (RG-IMP-03): the product, its units, prices and stock before → after. */
function planProduct(
  group: RawRow[],
  lines: ImportLine[],
  existing: Existing | undefined,
  context: Context,
): ProductPlan {
  const first = lines[0] as ImportLine;
  let name: string | null = null;
  let category: string | null = null;
  let threshold: string | null = null;
  let active: boolean | null = null;
  let baseLines = 0;
  const seen = new Set<string>();
  const units: UnitPlan[] = [];
  const existingBase = existing?.units.find((unit) => unit.isBase);

  for (const [index, raw] of group.entries()) {
    const line = lines[index] as ImportLine;
    const fail = (error: ImportLine['errors'][number]) => line.errors.push(error);
    const { cells } = raw;
    const tooLong = Object.entries(MAX_LENGTH).some(
      ([column, max]) => (cells[column] ?? '').length > max,
    );
    if (tooLong) fail('TEXT_TOO_LONG');
    if (cells.designation) {
      if (name === null) name = cells.designation;
      else if (cells.designation !== name) fail('NAME_CONFLICT');
    }
    if (cells.categorie) {
      if (category === null) category = cells.categorie;
      else if (cells.categorie.toLowerCase() !== category.toLowerCase()) fail('CATEGORY_CONFLICT');
    }
    const thresholdText = typed(cells.seuil_alerte);
    if (thresholdText && !QTY.test(thresholdText)) fail('THRESHOLD_INVALID');
    else if (thresholdText) threshold ??= thresholdText;

    const label = cells.unite ?? '';
    if (!label) fail('UNIT_MISSING');
    else if (seen.has(label.toLowerCase())) fail('DUPLICATE_UNIT');
    seen.add(label.toLowerCase());
    const qty = typed(cells.quantite);
    if (QTY.test(qty)) line.qty = qty;
    else fail('QTY_INVALID');
    const factor = typed(cells.facteur) || '1';
    const factorOk = FACTOR.test(factor) && Number(factor) > 0;
    if (!factorOk) fail('FACTOR_INVALID');
    const priceText = typed(cells.prix_vente);
    const priceOk = priceText === '' || (PRICE.test(priceText) && Number(priceText) > 0);
    if (!priceOk) fail('PRICE_INVALID');
    const activeText = (cells.actif ?? '').toUpperCase();
    if (activeText && activeText !== 'OUI' && activeText !== 'NON') fail('ACTIVE_INVALID');
    const lineActive = activeText === 'OUI' ? true : activeText === 'NON' ? false : null;
    const barcode = cells.code_barres || null;

    const match = label
      ? existing?.units.find((unit) => unit.label.toLowerCase() === label.toLowerCase())
      : undefined;
    const isBase = factorOk && Number(factor) === 1;
    const factorChanged = factorOk && match !== undefined && !match.factor.equals(factor);
    if (label.length > (isBase ? MAX_BASE_UNIT : MAX_UNIT)) fail('TEXT_TOO_LONG');
    if (isBase) {
      baseLines += 1;
      if (baseLines > 1) fail('TWO_BASE_UNITS');
      if (existingBase && label && existingBase.label.toLowerCase() !== label.toLowerCase()) {
        fail('BASE_UNIT_MISMATCH');
      }
      active = lineActive;
    } else if (factorChanged && (match.isBase || match._count.orderLines > 0)) {
      // The base unit is 1; a unit already sold keeps its content (RG-ART-06).
      fail('FACTOR_LOCKED');
    }
    if (
      barcode &&
      ((context.fileBarcodes.get(barcode) ?? 0) > 1 ||
        (context.barcodes.has(barcode) && context.barcodes.get(barcode) !== match?.id))
    ) {
      fail('BARCODE_TAKEN');
    }

    line.unitAction = label ? (match ? 'update' : 'create') : null;
    const currentOf = (type: CustomerType | null) =>
      match?.prices.find((entry) => entry.customerType === type)?.price.toFixed(2) ?? null;
    const current = currentOf(null);
    const typePrices: Partial<Record<CustomerType, string>> = {};
    for (const [column, type] of Object.entries(IMPORT_TYPE_PRICE_COLUMNS)) {
      const text = typed(cells[column]);
      if (!text) continue;
      if (!PRICE.test(text) || Number(text) <= 0) {
        fail('PRICE_INVALID');
        continue;
      }
      const before = currentOf(type);
      if (before === null || !new Decimal(before).equals(text)) {
        typePrices[type] = new Decimal(text).toFixed(2);
      }
    }
    if (Object.keys(typePrices).length > 0) line.typePrices = typePrices;
    line.priceBefore = current;
    if (priceOk && priceText && (current === null || !new Decimal(current).equals(priceText))) {
      line.price = new Decimal(priceText).toFixed(2);
      const pct = priceChangePct(current, line.price);
      if (pct !== null && Math.abs(Number(pct)) > IMPORT_PRICE_JUMP_PCT) {
        line.warnings.push('PRICE_JUMP');
      }
    }
    if (!priceText && current === null) line.warnings.push('NO_PRICE');
    if (line.qty !== null && factorOk) {
      line.baseQty = baseQuantity(line.qty, new Decimal(factor).toFixed(3));
    }
    units.push({
      label,
      factor: factorOk ? new Decimal(factor).toString() : '1',
      isBase,
      existingId: match?.id ?? null,
      factorChanged,
      barcode,
      active: isBase ? null : lineActive,
      qty: line.qty ?? '0',
      baseQty: line.baseQty ?? '0',
      price: line.price,
      typePrices,
    });
  }

  if (!existing && name === null) first.errors.push('NAME_MISSING');
  if (!existing && category === null) first.errors.push('CATEGORY_MISSING');
  if (!existing && baseLines === 0) first.errors.push('NO_BASE_UNIT');
  if (category !== null && !context.categories.has(category.toLowerCase())) {
    first.warnings.push('NEW_CATEGORY');
  }

  // Three active units at most once the file is applied (H65).
  const activeLabels = new Set(
    existing?.units.filter((unit) => unit.isActive).map((unit) => unit.label.toLowerCase()),
  );
  const added: number[] = [];
  units.forEach((unit, index) => {
    const key = unit.label.toLowerCase();
    if (unit.active === false) activeLabels.delete(key);
    else if (!activeLabels.has(key) && (unit.active === true || !unit.existingId)) {
      activeLabels.add(key);
      added.push(index);
    }
  });
  if (activeLabels.size > MAX_ACTIVE_UNITS) {
    for (const index of added.length > 0 ? added : [0]) lines[index]?.errors.push('UNIT_LIMIT');
  }

  const before = existing?.stock?.onHand ?? new Decimal(0);
  const reserved = existing?.stock?.reserved ?? new Decimal(0);
  const counted = units.reduce((total, unit) => total.plus(unit.baseQty), new Decimal(0));
  const after = context.mode === 'ENTRY' ? before.plus(counted) : counted;
  // A stocktake never leaves less than the goods of validated orders (CHECK reserved ≤ on_hand).
  if (after.lessThan(reserved)) first.errors.push('BELOW_RESERVED');
  first.stockBefore = before.toFixed(2);
  first.stockAfter = after.toFixed(2);

  return {
    existingId: existing?.id ?? null,
    sku: existing?.sku ?? first.sku,
    name,
    category,
    threshold,
    active,
    stockBefore: before.toFixed(2),
    stockAfter: after.toFixed(2),
    units,
  };
}

/**
 * The file as it would be recorded (RG-IMP-03, RG-IMP-04): lines grouped by code, each line with
 * its blocking errors and warnings; a code with one failing line fails as a whole.
 */
export async function planImport(
  tx: Tx,
  rows: RawRow[],
  mode: ImportMode,
  lock = false,
): Promise<ImportPlan> {
  const groups = new Map<string, RawRow[]>();
  for (const raw of rows) {
    const key = (raw.cells.code ?? '').toLowerCase();
    if (key) groups.set(key, [...(groups.get(key) ?? []), raw]);
  }
  const existing = await loadExisting(tx, [...groups.keys()], lock);
  const bySku = new Map(existing.map((product) => [product.sku.toLowerCase(), product]));
  const fileBarcodes = new Map<string, number>();
  for (const raw of rows) {
    const barcode = raw.cells.code_barres;
    if (barcode) fileBarcodes.set(barcode, (fileBarcodes.get(barcode) ?? 0) + 1);
  }
  const [categories, holders] = await Promise.all([
    tx.category.findMany({ select: { name: true } }),
    tx.productUnit.findMany({
      where: { barcode: { in: [...fileBarcodes.keys()] } },
      select: { id: true, barcode: true },
    }),
  ]);
  const context: Context = {
    mode,
    categories: new Set(categories.map((category) => category.name.toLowerCase())),
    barcodes: new Map(holders.map((unit) => [unit.barcode ?? '', unit.id])),
    fileBarcodes,
  };

  const lineOf = new Map<RawRow, ImportLine>();
  const products: ProductPlan[] = [];
  for (const raw of rows)
    lineOf.set(raw, blankLine(raw, bySku.get(raw.cells.code?.toLowerCase() ?? '')));
  for (const [key, group] of groups) {
    const lines = group.map((raw) => lineOf.get(raw) as ImportLine);
    const plan = planProduct(group, lines, bySku.get(key), context);
    if (lines.some((line) => line.errors.length > 0)) {
      for (const line of lines) if (line.errors.length === 0) line.errors.push('SIBLING_ERROR');
    } else products.push(plan);
  }

  const lines = rows.map((raw) => lineOf.get(raw) as ImportLine);
  const units = products.flatMap((product) => product.units);
  return {
    lines,
    products,
    rowsOk: lines.filter((line) => line.errors.length === 0).length,
    rowsError: lines.filter((line) => line.errors.length > 0).length,
    totals: {
      productsCreated: products.filter((product) => !product.existingId).length,
      productsUpdated: products.filter((product) => product.existingId).length,
      unitsCreated: units.filter((unit) => !unit.existingId).length,
      qtyIn: units.reduce((total, unit) => total.plus(unit.baseQty), new Decimal(0)).toFixed(2),
      pricesChanged: units.filter((unit) => unit.price !== null).length,
    },
  };
}
