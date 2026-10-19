import { EXPORTS, exportsFor, type ExportKind, type ExportQuery } from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { Actor } from './actor.js';
import { writeWorkbook, type Rows } from './export-book.js';
import {
  closingRows,
  discountCodeRows,
  discountRows,
  paymentRows,
  queueRows,
  salesRows,
  type Span,
} from './exports-sales.js';
import {
  auditRows,
  customerRows,
  movementRows,
  priceGridRows,
  priceHistoryRows,
  stockRows,
} from './exports-stock.js';
import { shopDayStart, shopIsoDate } from './shop-time.js';

const dayOf = (day: string) => new Date(`${day}T12:00:00Z`);

/**
 * One export as an Excel workbook (T-071, RG-EXP-01 à 03): only what the role may take, a
 * cashier's own closings only; the period runs over whole shop days, `from` to `to` included.
 */
export async function buildExport(
  db: Db,
  actor: Actor,
  kind: ExportKind,
  { from, to }: ExportQuery,
): Promise<{ file: string; content: Buffer }> {
  if (!exportsFor(actor.activeRole).includes(kind)) throw new AppError(403, 'AUTH_FORBIDDEN');
  const span: Span = { gte: shopDayStart(dayOf(from)), lt: shopDayStart(dayOf(to), 1) };
  const ownOnly = actor.activeRole === 'cashier' ? actor.userId : undefined;
  const rows: Record<ExportKind, () => Promise<Rows[]>> = {
    sales: () => salesRows(db, span),
    payments: () => paymentRows(db, span),
    discounts: () => discountRows(db, span),
    discountCodes: () => discountCodeRows(db, span),
    closings: () => closingRows(db, span, ownOnly),
    stockMovements: () => movementRows(db, span),
    stock: () => stockRows(db),
    prices: () => priceGridRows(db),
    priceHistory: () => priceHistoryRows(db, span),
    queues: () => queueRows(db, span),
    customers: () => customerRows(db),
    audit: () => auditRows(db, span),
  };
  const definition = EXPORTS[kind];
  const dated = definition.snapshot ? shopIsoDate(new Date()) : `${from}-${to}`;
  return {
    file: `${definition.file}-${dated}.xlsx`,
    content: await writeWorkbook(definition, await rows[kind]()),
  };
}
