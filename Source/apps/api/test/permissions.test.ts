import { ROLES, type Role } from '@vente-web/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { can, PERMISSIONS, type Permission } from '../src/permissions.js';
import { TEST_DATABASE_URL } from './db.js';
import { createTestApp, createUser, loginOk, request, type TestApp } from './helpers.js';

const ID = '00000000-0000-7000-8000-000000000000';

/** One route per right of annexe B (two for the owner's decision). */
const PROBES: [Permission, 'GET' | 'POST' | 'PUT' | 'PATCH', string][] = [
  ['products.read', 'GET', '/products'],
  ['products.edit', 'POST', '/products'],
  ['discountCaps.read', 'GET', '/discount-caps'],
  ['discountCaps.edit', 'PUT', '/discount-caps/default'],
  ['promotions', 'GET', '/promotions'],
  ['imports', 'GET', '/imports'],
  ['stock.adjust', 'GET', `/products/${ID}/stock`],
  ['stock.alerts', 'GET', '/stock/alerts'],
  ['customers.read', 'GET', '/customers/categories'],
  ['customers.create', 'POST', '/customers'],
  ['customers.edit', 'PATCH', `/customers/${ID}`],
  ['customers.manage', 'POST', `/customers/${ID}/category`],
  ['customers.type', 'POST', `/customers/${ID}/type`],
  ['discountRules.read', 'GET', '/discount-rules'],
  ['discountRules.edit', 'POST', '/discount-rules'],
  ['credit.read', 'GET', '/credit-conditions'],
  ['credit.conditions', 'POST', '/credit-conditions'],
  ['credit.settle', 'POST', `/receivables/${ID}/settlements`],
  ['credit.instruments', 'POST', `/receivables/${ID}/instrument`],
  ['reservationDays.read', 'GET', '/reservation-days'],
  ['reservationDays.edit', 'PUT', '/reservation-days'],
  ['quotes.read', 'GET', `/quotes/${ID}`],
  ['quotes.create', 'POST', '/quotes'],
  ['quotes.edit', 'GET', '/quotes'],
  ['kiosk.read', 'GET', '/kiosk-baskets'],
  ['kiosk.take', 'POST', `/kiosk-baskets/${ID}/take`],
  ['orders.read', 'GET', `/orders/${ID}`],
  ['orders.submit', 'POST', `/orders/${ID}/submit`],
  ['orders.change', 'POST', `/orders/${ID}/send-back`],
  ['orders.cancel', 'POST', `/orders/${ID}/cancel`],
  ['orders.discount', 'POST', `/orders/${ID}/discounts`],
  ['discountRequests.ask', 'POST', '/discount-requests'],
  ['discountRequests.reasons', 'GET', '/discount-requests/reasons'],
  ['discountRequests.board', 'GET', '/discount-requests'],
  ['discountRequests.decide', 'POST', `/discount-requests/${ID}/grant`],
  ['discountRequests.decide', 'POST', `/discount-requests/${ID}/reject`],
  ['discountCodes', 'GET', '/discount-codes'],
  ['queues.register', 'POST', `/orders/${ID}/call`],
  ['queues.supervise', 'POST', '/queues/register/reorder'],
  ['supervision', 'GET', '/supervision/today'],
  ['payments', 'GET', '/payment-methods'],
  ['refunds', 'GET', '/invoices/lookup'],
  ['refunds.read', 'GET', `/credit-notes/${ID}/pdf`],
  ['deliveries', 'POST', `/orders/${ID}/delivery/take`],
  ['deliveries.supervise', 'GET', '/deliveries/issues'],
  ['register', 'GET', '/register-sessions/current/summary'],
  ['register.read', 'GET', `/register-sessions/${ID}/report`],
  ['register.list', 'GET', '/register-sessions'],
  ['dashboard', 'GET', '/dashboard'],
  ['exports', 'GET', '/exports/unknown'],
  ['audit.read', 'GET', '/audit'],
  ['accounts', 'GET', '/users'],
  ['settings.read', 'GET', '/settings'],
  ['settings.edit', 'PUT', '/settings/vat_rate'],
  ['push', 'GET', '/push/key'],
];

const PASSWORDS: Record<Role, string> = {
  sales: '1234',
  cashier: '1234',
  warehouse: '1234',
  manager: '1234',
  owner: 'Boss-1234!',
  admin: 'Admin-1234!',
};

describe.skipIf(!TEST_DATABASE_URL)('the rights of annexe B (T-013)', () => {
  let t: TestApp;
  const cookies = {} as Record<Role, string>;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reset();
    for (const role of ROLES) {
      const password = PASSWORDS[role];
      await createUser(t.db, {
        username: `u-${role}`,
        roles: [role],
        password,
        ...(role === 'sales' ? { ticketLetter: 'A' } : {}),
      });
      cookies[role] = (await loginOk(t.app, { username: `u-${role}`, role, password })).cookie;
    }
  });
  afterAll(() => t.close());

  it('probes every right', () => {
    expect(new Set(PROBES.map(([permission]) => permission))).toEqual(
      new Set(Object.keys(PERMISSIONS)),
    );
  });

  it.each(PROBES)('%s: %s %s', async (permission, method, url) => {
    for (const role of ROLES) {
      const reply = await request(t.app, method, `/api/v1${url}`, {
        cookie: cookies[role],
        ...(method === 'GET' ? {} : { body: {} }),
      });
      const forbidden = reply.statusCode === 403 && reply.json().code === 'AUTH_FORBIDDEN';
      expect(forbidden, `${role} → ${reply.statusCode} ${reply.body}`).toBe(!can(role, permission));
    }
  });
});
