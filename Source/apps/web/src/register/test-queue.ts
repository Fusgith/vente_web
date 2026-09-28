import type { Order, Queue, QueueItem } from '@vente-web/shared';

import { HERY } from '../test/fake-api.js';

/** Register queue and orders as the API returns them, for the register screen tests. */
export const ID = (n: number) => `0192a4f0-0000-7000-8000-00000000040${n}`;

export function item(n: number, overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    orderId: ID(n),
    number: `D-2026-00004${n}`,
    status: 'SUBMITTED',
    ticket: { letter: 'A', seq: n, date: '2026-09-26' },
    customer: {
      name: ['Rasoa Hanta', 'Rabe Paul', 'Randria Solo'][n - 1] ?? 'Client',
      phone: '0341122233',
    },
    salesUser: { id: '0192a4f0-0000-7000-8000-000000000501', fullName: 'Vola Commerciale' },
    total: '65000.00',
    priority: false,
    noShowCount: 0,
    submittedAt: new Date(Date.now() - n * 5 * 60_000).toISOString(),
    calledAt: null,
    paidAt: null,
    servedBy: null,
    station: null,
    ...overrides,
  };
}

export const queueOf = (waiting: QueueItem[], serving: QueueItem[] = []): Queue => ({
  queue: 'register',
  waiting,
  serving,
});

/** The order as the API returns it after a call; only the ticket and the name matter here. */
export function orderOf(entry: QueueItem): Order {
  const zero = '0.00';
  return {
    id: entry.orderId,
    number: entry.number,
    version: 2,
    customer: { id: '0192a4f0-0000-7000-8000-000000000301', ...entry.customer },
    salesUser: entry.salesUser,
    lines: [],
    grossTotal: zero,
    lineDiscounts: zero,
    subtotal: zero,
    orderDiscountPct: null,
    orderDiscount: zero,
    discountTotal: zero,
    total: entry.total,
    createdAt: entry.submittedAt,
    updatedAt: entry.submittedAt,
    status: 'AT_REGISTER',
    ticket: entry.ticket,
    submittedAt: entry.submittedAt,
    expiresAt: null,
  };
}

export const atMyRegister = (entry: QueueItem): QueueItem => ({
  ...entry,
  status: 'AT_REGISTER',
  calledAt: new Date().toISOString(),
  servedBy: { id: HERY.id, fullName: HERY.fullName },
});

/** The order at the register with two lines: 4 packs of soap at 5 % (within cap), 3 kg of nails. */
export function orderWithLines(entry: QueueItem, version = 2): Order {
  const line = {
    productId: '0192a4f0-0000-7000-8000-000000000101',
    productUnitId: '0192a4f0-0000-7000-8000-000000000112',
    capPct: '5',
  };
  return {
    ...orderOf(entry),
    version,
    lines: [
      {
        ...line,
        position: 1,
        sku: 'SAV-001',
        name: 'Savon de Marseille 400 g',
        unitLabel: 'paquet',
        factor: '6',
        baseUnit: 'pièce',
        qty: '4',
        unitPrice: '25000.00',
        gross: '100000.00',
        discountPct: '5.00',
        discountAmount: '5000.00',
        discountSource: 'WITHIN_CAP',
        net: '95000.00',
      },
      {
        ...line,
        productId: '0192a4f0-0000-7000-8000-000000000103',
        productUnitId: '0192a4f0-0000-7000-8000-000000000131',
        capPct: '15',
        position: 2,
        sku: 'CLO-001',
        name: 'Clous 5 cm',
        unitLabel: 'kg',
        factor: '1',
        baseUnit: 'kg',
        qty: '3',
        unitPrice: '6500.00',
        gross: '19500.00',
        discountPct: '0.00',
        discountAmount: '0.00',
        discountSource: 'NONE',
        net: '19500.00',
      },
    ],
    grossTotal: '119500.00',
    lineDiscounts: '5000.00',
    subtotal: '114500.00',
    discountTotal: '5000.00',
    total: '114500.00',
  };
}

/** The register this cashier opened (T-051, H32). */
export const SESSION = {
  id: '0192a4f0-0000-7000-8000-000000000601',
  station: { id: '0192a4f0-0000-7000-8000-000000000611', name: 'Caisse 2' },
  openedAt: '2026-09-28T05:02:00.000Z',
  openingFloat: '50000.00',
};

/** The API answers of an opened register, spread first into a test's handlers. */
export const OPENED = {
  'GET /register-sessions/current': { status: 200, body: { session: SESSION } },
};
