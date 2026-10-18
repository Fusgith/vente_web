import type { Dashboard, DashboardFigures, DashboardQuery } from '@vente-web/shared';

import type { Db } from '../db.js';
import { SHOP_TIME_ZONE, shopDayStart, shopIsoDate } from './shop-time.js';

const TOP_PRODUCTS = 20;
const PRICE_CHANGES = 100;

const hourFormat = new Intl.DateTimeFormat('en', {
  timeZone: SHOP_TIME_ZONE,
  hour: 'numeric',
  hourCycle: 'h23',
});

/** Hundredths, exact (RG-FMT-01). */
const cents = (value: { toFixed(digits: number): string }) =>
  BigInt(value.toFixed(2).replace('.', ''));
function money(value: bigint): string {
  const digits = (value < 0n ? -value : value).toString().padStart(3, '0');
  return `${value < 0n ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/** `2026-10-19` moved by `days`, in UTC where no day is skipped. */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function lastOfMonth(day: string): string {
  const end = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0));
  return end.toISOString().slice(0, 10);
}

/**
 * The period compared to `from`–`to` (RG-DSH-04): a month started on the 1st meets the same days
 * of the month before (1–19 October → 1–19 September); any other period, the days just before
 * it, as many (a day → the day before, a week → the week before).
 */
export function previousPeriod(from: string, to: string): DashboardQuery {
  if (from.endsWith('-01') && from.slice(0, 7) === to.slice(0, 7)) {
    const start = `${addDays(from, -1).slice(0, 8)}01`;
    const end = `${start.slice(0, 8)}${to.slice(8)}`;
    const last = lastOfMonth(start);
    return { from: start, to: end > last ? last : end };
  }
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

/** The instants of the shop's days `from` to `to`, both included. */
const span = ({ from, to }: DashboardQuery) => ({
  gte: shopDayStart(new Date(`${from}T12:00:00Z`)),
  lt: shopDayStart(new Date(`${to}T12:00:00Z`), 1),
});

function readInvoices(db: Db, period: DashboardQuery) {
  return db.invoice.findMany({
    where: { issuedAt: span(period) },
    select: {
      issuedAt: true,
      order: {
        select: {
          total: true,
          discountTotal: true,
          orderDiscountAmount: true,
          orderDiscountSource: true,
          salesUser: { select: { fullName: true } },
          lines: {
            select: {
              productId: true,
              unitLabel: true,
              qty: true,
              baseQty: true,
              lineTotal: true,
              discountAmount: true,
              discountSource: true,
              orderDiscountShare: true,
              product: {
                select: {
                  sku: true,
                  name: true,
                  baseUnit: true,
                  category: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });
}
type Invoices = Awaited<ReturnType<typeof readInvoices>>;

async function readPeriod(db: Db, period: DashboardQuery) {
  const [invoices, payments, refunds] = await Promise.all([
    readInvoices(db, period),
    db.paymentLine.findMany({
      where: { payment: { createdAt: span(period) } },
      select: { amount: true, method: { select: { label: true, sortOrder: true } } },
    }),
    db.creditNote.findMany({ where: { issuedAt: span(period) }, select: { amount: true } }),
  ]);
  return { invoices, payments, refunds };
}
type Period = Awaited<ReturnType<typeof readPeriod>>;

function figuresOf({ invoices, payments, refunds }: Period): DashboardFigures {
  let sales = 0n;
  let discounts = 0n;
  let gross = 0n;
  const bySource = { WITHIN_CAP: 0n, RULE: 0n, CODE: 0n, NONE: 0n };
  for (const { order } of invoices) {
    sales += cents(order.total);
    discounts += cents(order.discountTotal);
    bySource[order.orderDiscountSource] += cents(order.orderDiscountAmount);
    for (const line of order.lines) {
      gross += cents(line.lineTotal) + cents(line.discountAmount);
      bySource[line.discountSource] += cents(line.discountAmount);
    }
  }
  const sum = (values: { amount: { toFixed(digits: number): string } }[]) =>
    values.reduce((total, { amount }) => total + cents(amount), 0n);
  return {
    collected: money(sum(payments)),
    invoices: invoices.length,
    averageBasket: money(invoices.length > 0 ? sales / BigInt(invoices.length) : 0n),
    sales: money(sales),
    gross: money(gross),
    discounts: money(discounts),
    discountsWithinCap: money(bySource.WITHIN_CAP),
    discountsByRule: money(bySource.RULE),
    discountsByCode: money(bySource.CODE),
    creditNotes: refunds.length,
    refunded: money(sum(refunds)),
  };
}

/** Invoices and sales per key. */
function tally<K extends string | number>(
  invoices: Invoices,
  keyOf: (invoice: Invoices[number]) => K,
) {
  const totals = new Map<K, { invoices: number; sales: bigint }>();
  for (const invoice of invoices) {
    const key = keyOf(invoice);
    const entry = totals.get(key) ?? { invoices: 0, sales: 0n };
    entry.invoices += 1;
    entry.sales += cents(invoice.order.total);
    totals.set(key, entry);
  }
  return [...totals].map(([key, { invoices, sales }]) => ({ key, invoices, sales }));
}

const bySales = (a: { sales: bigint }, b: { sales: bigint }) =>
  a.sales === b.sales ? 0 : a.sales > b.sales ? -1 : 1;

/** What the products sold in the period, the best sellers first, with their stock (RG-DSH-03). */
async function productsOf(db: Db, invoices: Invoices) {
  const products = new Map<
    string,
    {
      sku: string;
      name: string;
      baseUnit: string;
      baseQty: bigint;
      sales: bigint;
      units: Map<string, bigint>;
    }
  >();
  const categories = new Map<string, bigint>();
  for (const { order } of invoices) {
    for (const line of order.lines) {
      const net = cents(line.lineTotal) - cents(line.orderDiscountShare);
      const entry = products.get(line.productId) ?? {
        ...line.product,
        baseQty: 0n,
        sales: 0n,
        units: new Map<string, bigint>(),
      };
      entry.baseQty += cents(line.baseQty);
      entry.sales += net;
      entry.units.set(line.unitLabel, (entry.units.get(line.unitLabel) ?? 0n) + cents(line.qty));
      products.set(line.productId, entry);
      const category = line.product.category?.name ?? '';
      categories.set(category, (categories.get(category) ?? 0n) + net);
    }
  }
  const top = [...products].sort(([, a], [, b]) => bySales(a, b)).slice(0, TOP_PRODUCTS);
  const stocks = await db.productStock.findMany({
    where: { productId: { in: top.map(([id]) => id) } },
    select: { productId: true, onHand: true, reserved: true },
  });
  const available = new Map(
    stocks.map((stock) => [stock.productId, cents(stock.onHand) - cents(stock.reserved)]),
  );
  return {
    topProducts: top.map(([id, product]) => ({
      sku: product.sku,
      name: product.name,
      baseUnit: product.baseUnit,
      baseQty: money(product.baseQty),
      units: [...product.units].map(([unit, qty]) => ({ unit, qty: money(qty) })),
      sales: money(product.sales),
      available: money(available.get(id) ?? 0n),
    })),
    byCategory: [...categories]
      .map(([name, sales]) => ({ name, sales }))
      .sort(bySales)
      .map(({ name, sales }) => ({ name, sales: money(sales) })),
  };
}

/** The prices that changed in the period, each with the one it replaced (RG-ART-07). */
async function priceChangesOf(db: Db, period: DashboardQuery): Promise<Dashboard['priceChanges']> {
  const changed = await db.productPrice.findMany({
    where: { effectiveFrom: span(period) },
    orderBy: { effectiveFrom: 'desc' },
    take: PRICE_CHANGES,
    select: {
      id: true,
      productUnitId: true,
      price: true,
      effectiveFrom: true,
      source: true,
      setBy: { select: { fullName: true } },
      productUnit: { select: { label: true, product: { select: { sku: true, name: true } } } },
    },
  });
  const history = await db.productPrice.findMany({
    where: { productUnitId: { in: [...new Set(changed.map((price) => price.productUnitId))] } },
    orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }],
    select: { id: true, productUnitId: true, price: true },
  });
  return changed.flatMap((price) => {
    const unit = history.filter((row) => row.productUnitId === price.productUnitId);
    const before = unit[unit.findIndex((row) => row.id === price.id) - 1];
    // A product's first price is no change.
    if (!before) return [];
    return [
      {
        at: price.effectiveFrom.toISOString(),
        sku: price.productUnit.product.sku,
        name: price.productUnit.product.name,
        unit: price.productUnit.label,
        before: before.price.toFixed(2),
        after: price.price.toFixed(2),
        source: price.source,
        by: price.setBy.fullName,
      },
    ];
  });
}

/**
 * The owner's dashboard (T-070; RG-DSH-01, 03, 04): the period's sales from its invoices, the
 * money from its payments, compared with the period before and the same days a week earlier.
 * The live queues and the products under their threshold have their own reads (RG-DSH-02/03).
 */
export async function loadDashboard(db: Db, query: DashboardQuery): Promise<Dashboard> {
  const weekBefore = { from: addDays(query.from, -7), to: addDays(query.to, -7) };
  const [current, previous, lastWeek, priceChanges] = await Promise.all([
    readPeriod(db, query),
    readPeriod(db, previousPeriod(query.from, query.to)),
    readPeriod(db, weekBefore),
    priceChangesOf(db, query),
  ]);
  const methods = new Map<string, { amount: bigint; order: number }>();
  for (const { amount, method } of current.payments) {
    const entry = methods.get(method.label) ?? { amount: 0n, order: method.sortOrder };
    entry.amount += cents(amount);
    methods.set(method.label, entry);
  }
  const { invoices } = current;
  return {
    ...query,
    current: figuresOf(current),
    previous: figuresOf(previous),
    weekBefore: figuresOf(lastWeek),
    byMethod: [...methods]
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([label, { amount }]) => ({ label, amount: money(amount) })),
    bySalesperson: tally(invoices, (invoice) => invoice.order.salesUser.fullName)
      .sort(bySales)
      .map(({ key, invoices, sales }) => ({ name: key, invoices, sales: money(sales) })),
    byHour: tally(invoices, (invoice) => Number(hourFormat.format(invoice.issuedAt)))
      .sort((a, b) => a.key - b.key)
      .map(({ key, invoices, sales }) => ({ hour: key, invoices, sales: money(sales) })),
    byDay: tally(invoices, (invoice) => shopIsoDate(invoice.issuedAt))
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(({ key, invoices, sales }) => ({ date: key, invoices, sales: money(sales) })),
    ...(await productsOf(db, invoices)),
    priceChanges,
  };
}
