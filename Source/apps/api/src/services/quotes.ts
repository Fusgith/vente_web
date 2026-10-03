import {
  baseQuantity,
  computeQuote,
  grantsFor,
  type CodeGrant,
  quoteNumber,
  type DiscountEntry,
  type Quote,
  type QuoteBeyondCap,
  type QuoteLineEntry,
  type QuoteSave,
  type QuoteTotals,
  type QuoteUnavailable,
  type QuoteUpdate,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit, type AuditSnapshot, type AuditTx } from './audit.js';
import { findCustomer } from './customers.js';
import { CODE_SELECT, findOrder, grantsOf, toQuote } from './order-view.js';
import { defaultDiscountCap, inForceAt, unitCap } from './product-hits.js';
import { nextSequenceValue } from './sequences.js';
import { readSetting } from './settings.js';
import { shopYear } from './shop-time.js';

/** A line typed on the tablet, priced again here, with what the saved line freezes. */
export interface PricedLine {
  entry: QuoteLineEntry;
  productId: string;
  sku: string;
  name: string;
  unitLabel: string;
  factor: string;
  unitPrice: string;
  /** The price row in force now, which a validated line references (RG-CMD-04, RG-ART-07). */
  priceId: string;
  /** Resolved now (RG-REM-01), frozen on the line. */
  capPct: string;
}

/** A quote, i.e. an order still in DRAFT; an order has its own screens (T-032). */
export async function loadQuote(db: AuditTx, id: string): Promise<Quote> {
  const order = await findOrder(db, id);
  if (!order || order.status !== 'DRAFT') throw new AppError(404, 'NOT_FOUND');
  return toQuote(order);
}

/** Mandatory, and never a deactivated or merged record (RG-DEV-04). */
export async function assertActiveCustomer(db: Db, id: string): Promise<void> {
  if (!(await findCustomer(db, id)).isActive) throw new AppError(409, 'CUSTOMER_INACTIVE');
}

/**
 * Each line in its sale unit at the price in force now, with its cap resolved now; a unit
 * deactivated or without a price since it was added is refused with the positions concerned.
 */
export async function priceLines(
  db: Db,
  entries: readonly QuoteLineEntry[],
): Promise<PricedLine[]> {
  const now = new Date();
  const [units, fallbackCap] = await Promise.all([
    db.productUnit.findMany({
      where: {
        id: { in: entries.map((entry) => entry.productUnitId) },
        isActive: true,
        product: { isActive: true },
      },
      include: {
        product: { include: { category: { select: { maxDiscountPct: true } } } },
        prices: {
          where: inForceAt(now),
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
          select: { id: true, price: true },
        },
      },
    }),
    defaultDiscountCap(db),
  ]);
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const unavailable: number[] = [];
  const priced = entries.flatMap((entry, index): PricedLine[] => {
    const unit = byId.get(entry.productUnitId);
    const price = unit?.prices[0];
    if (!unit || !price) {
      unavailable.push(index + 1);
      return [];
    }
    const factor = unit.factor.toFixed();
    // 0,01 of a unit smaller than the base one would weigh nothing in stock (RG-ART-06).
    if (baseQuantity(entry.qty, factor) === '0.00') throw new AppError(400, 'VALIDATION_ERROR');
    return [
      {
        entry,
        productId: unit.productId,
        sku: unit.product.sku,
        name: unit.product.name,
        unitLabel: unit.label,
        factor,
        unitPrice: price.price.toFixed(2),
        priceId: price.id,
        capPct: unitCap(unit, unit.product, fallbackCap),
      },
    ];
  });
  if (unavailable.length > 0) {
    throw new AppError(422, 'QUOTE_LINE_UNAVAILABLE', {
      lines: unavailable,
    } satisfies QuoteUnavailable);
  }
  return priced;
}

/** What the owner's code grants each priced line, and the total (RG-REM-04, H41). */
export function grantsOn(lines: readonly PricedLine[], grants: readonly CodeGrant[]) {
  return grantsFor(
    grants,
    lines.map((line) => ({
      productId: line.productId,
      quantity: line.entry.qty,
      unitPrice: line.unitPrice,
    })),
  );
}

/**
 * The engine's totals, every discount within its cap — or within what the owner's code attached
 * grants on it, which replaces the cap (RG-REM-04/06).
 */
export function totalsWithinCaps(
  lines: readonly PricedLine[],
  orderDiscount: DiscountEntry | null,
  grants: readonly CodeGrant[] = [],
): QuoteTotals {
  const granted = grantsOn(lines, grants);
  const totals = computeQuote({
    lines: lines.map((line, index) => ({
      quantity: line.entry.qty,
      unitPrice: line.unitPrice,
      capPct: line.capPct,
      discount: line.entry.discount,
      granted: granted.lines[index] ?? null,
    })),
    orderDiscount,
    orderGranted: granted.order,
  });
  if (!totals.withinLimits) {
    throw new AppError(422, 'QUOTE_DISCOUNT_BEYOND_CAP', {
      lines: totals.lines.flatMap((line, index) => (line.withinLimit ? [] : [index + 1])),
      order: !totals.orderWithinLimit,
    } satisfies QuoteBeyondCap);
  }
  return totals;
}

/**
 * An order is never free (RG-PAY-02, H50): totals brought to 0,00 MGA are refused — by a code,
 * a validation or a change at the register —, `reason` telling which.
 */
export function assertNotFree(
  totals: QuoteTotals,
  reason:
    | 'ORDER_TOTAL_ZERO'
    | 'DISCOUNT_CODE_FREE_ORDER'
    | 'DISCOUNT_REQUEST_FREE_ORDER' = 'ORDER_TOTAL_ZERO',
): void {
  if (totals.total === '0.00') throw new AppError(422, reason);
}

/** The order's amounts; the code is named where its grant was used (RG-REM-07). */
export function orderAmounts(totals: QuoteTotals, codeId: string | null = null) {
  return {
    orderDiscountCodeId: totals.orderDiscountSource === 'CODE' ? codeId : null,
    subtotal: totals.subtotal,
    orderDiscountPct: totals.orderDiscountPct,
    orderDiscountAmount: totals.orderDiscount,
    orderDiscountSource: totals.orderDiscountSource,
    discountTotal: totals.discountTotal,
    total: totals.total,
  };
}

export function lineRows(lines: PricedLine[], totals: QuoteTotals, codeId: string | null = null) {
  return lines.flatMap((line, index) => {
    const computed = totals.lines[index];
    if (!computed) return [];
    return [
      {
        position: index + 1,
        productId: line.productId,
        productUnitId: line.entry.productUnitId,
        sku: line.sku,
        name: line.name,
        unitLabel: line.unitLabel,
        factor: line.factor,
        qty: line.entry.qty,
        baseQty: baseQuantity(line.entry.qty, line.factor),
        unitPrice: line.unitPrice,
        maxDiscountPct: line.capPct,
        discountPct: computed.discountPct,
        discountAmount: computed.discount,
        discountSource: computed.source,
        discountCodeId: computed.source === 'CODE' ? codeId : null,
        lineTotal: computed.net,
        orderDiscountShare: computed.orderDiscountShare,
      },
    ];
  });
}

/** What the audit keeps of a quote: enough to see every discount given (RG-AUD-01). */
export function snapshot(quote: Quote): AuditSnapshot {
  return {
    number: quote.number,
    customerId: quote.customer.id,
    lines: quote.lines.map((line) => ({
      sku: line.sku,
      unit: line.unitLabel,
      qty: line.qty,
      unitPrice: line.unitPrice,
      discount: line.discountAmount,
    })),
    orderDiscount: quote.orderDiscount,
    discountTotal: quote.discountTotal,
    total: quote.total,
  };
}

async function quotePrefix(db: Db): Promise<string> {
  const value = await readSetting(db, 'quote_prefix');
  return typeof value === 'string' && /^[A-Z]{1,4}$/.test(value) ? value : 'D';
}

/** Next number of the shop's year (RG-DEV-02); gaps are tolerated for quotes. */
async function nextQuoteNumber(tx: Prisma.TransactionClient, prefix: string): Promise<string> {
  const year = shopYear(new Date());
  return quoteNumber(prefix, year, await nextSequenceValue(tx, `QUOTE-${year}`));
}

/** A new quote of the salesperson: priced, checked and numbered here (RG-DEV-01/02/05). */
export async function createQuote(db: Db, actor: Actor, input: QuoteSave): Promise<Quote> {
  await assertActiveCustomer(db, input.customerId);
  const lines = await priceLines(db, input.lines);
  const totals = totalsWithinCaps(lines, input.orderDiscount);
  const prefix = await quotePrefix(db);
  return db.$transaction(async (tx) => {
    const { id } = await tx.order.create({
      data: {
        number: await nextQuoteNumber(tx, prefix),
        salesUserId: actor.userId,
        customerId: input.customerId,
        ...orderAmounts(totals),
        lines: { create: lineRows(lines, totals) },
      },
      select: { id: true },
    });
    const quote = await loadQuote(tx, id);
    await recordAudit(tx, {
      ...by(actor),
      action: 'quote.created',
      entityType: 'order',
      entityId: id,
      after: snapshot(quote),
    });
    return quote;
  });
}

/**
 * The quote saved again with its lines replaced. Annexe B: a salesperson edits their own quotes,
 * the manager any; another salesperson takes one over by validating it (RG-DEV-03, T-032).
 */
export async function updateQuote(
  db: Db,
  actor: Actor,
  id: string,
  input: QuoteUpdate,
): Promise<Quote> {
  const current = await db.order.findUnique({
    where: { id },
    select: {
      status: true,
      salesUserId: true,
      customerId: true,
      version: true,
      _count: { select: { discountRequests: { where: { status: 'PENDING' } } } },
    },
  });
  if (!current) throw new AppError(404, 'NOT_FOUND');
  if (current.status !== 'DRAFT') throw new AppError(409, 'QUOTE_NOT_DRAFT');
  if (actor.activeRole === 'sales' && current.salesUserId !== actor.userId) {
    throw new AppError(403, 'AUTH_FORBIDDEN');
  }
  if (current.version !== input.version) throw new AppError(409, 'QUOTE_CHANGED');
  // The owner decides for this customer: the request stays with them (H52). A request made
  // meanwhile moved the version on: the guarded save below refuses.
  if (current.customerId !== input.customerId && current._count.discountRequests > 0) {
    throw new AppError(409, 'DISCOUNT_REQUEST_PENDING');
  }
  await assertActiveCustomer(db, input.customerId);
  const lines = await priceLines(db, input.lines);
  // The code attached stays with the quote: its grants still bound the discounts typed (T-034b).
  const code = await db.discountCode.findFirst({
    where: { usedOnOrderId: id },
    select: { ...CODE_SELECT, customerId: true },
  });
  // A code issued for a customer does not follow the quote to another one (RG-REM-04).
  if (code?.customerId && code.customerId !== input.customerId) {
    throw new AppError(409, 'DISCOUNT_CODE_OTHER_CUSTOMER');
  }
  const codeId = code?.id ?? null;
  const totals = totalsWithinCaps(lines, input.orderDiscount, grantsOf(code));
  return db.$transaction(async (tx) => {
    const before = await loadQuote(tx, id);
    // Guarded on the version read and on DRAFT: a save or a validation committed meanwhile wins.
    const { count } = await tx.order.updateMany({
      where: { id, status: 'DRAFT', version: input.version },
      data: {
        customerId: input.customerId,
        ...orderAmounts(totals, codeId),
        version: { increment: 1 },
      },
    });
    if (count === 0) throw new AppError(409, 'QUOTE_CHANGED');
    await tx.orderLine.deleteMany({ where: { orderId: id } });
    await tx.orderLine.createMany({
      data: lineRows(lines, totals, codeId).map((row) => ({ ...row, orderId: id })),
    });
    const quote = await loadQuote(tx, id);
    await recordAudit(tx, {
      ...by(actor),
      action: 'quote.updated',
      entityType: 'order',
      entityId: id,
      before: snapshot(before),
      after: snapshot(quote),
    });
    return quote;
  });
}
