import { randomUUID } from 'node:crypto';

import { customerSchema, EXPORT_KINDS, EXPORTS, quoteSchema, type Role } from '@vente-web/shared';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { shopIsoDate } from '../src/services/shop-time.js';
import { seedDemoCatalog, seedPaymentMethods, unitId } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  createStation,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('Excel exports (T-071, RG-EXP-01 à 03)', () => {
  let t: TestApp;
  const cookies = { sales: '', cashier: '', other: '', owner: '', admin: '' };
  let methods: Record<string, string> = {};
  let customer = '';
  const today = () => shopIsoDate(new Date());

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    methods = await seedPaymentMethods(t.db);
    await createUser(t.db, {
      username: 'vola',
      roles: ['sales'],
      password: '1234',
      ticketLetter: 'A',
    });
    await createUser(t.db, { username: 'soa', roles: ['cashier'], password: '3456' });
    await createUser(t.db, { username: 'rina', roles: ['cashier'], password: '5678' });
    await createUser(t.db, { username: 'boss', roles: ['owner'], password: 'Boss-1234!' });
    await createUser(t.db, { username: 'adm', roles: ['admin'], password: 'Admin-1234!' });
    const login = async (username: string, role: Role, password: string) =>
      (await loginOk(t.app, { username, role, password })).cookie;
    cookies.sales = await login('vola', 'sales', '1234');
    cookies.cashier = await login('soa', 'cashier', '3456');
    cookies.other = await login('rina', 'cashier', '5678');
    cookies.owner = await login('boss', 'owner', 'Boss-1234!');
    cookies.admin = await login('adm', 'admin', 'Admin-1234!');
    customer = customerSchema.parse(
      (
        await post('/customers', cookies.sales, { name: 'Rasoa Hanta', phone: '034 11 222 33' })
      ).json(),
    ).id;
    for (const cookie of [cookies.cashier, cookies.other]) {
      const register = (await createStation(t.db, 'REGISTER')).id;
      await post('/register-sessions', cookie, { stationId: register, openingFloat: '0' });
    }
  });

  function post(url: string, cookie: string, body?: unknown, key?: string) {
    return request(t.app, 'POST', `/api/v1${url}`, {
      cookie,
      ...(body ? { body } : {}),
      ...(key ? { headers: { 'idempotency-key': key } } : {}),
    });
  }

  const download = (kind: string, cookie: string, from = today(), to = today()) =>
    request(t.app, 'GET', `/api/v1/exports/${kind}?from=${from}&to=${to}`, { cookie });

  async function workbook(payload: Buffer) {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(payload as unknown as ArrayBuffer);
    return book;
  }

  /** 2 kg of nails (6 500,00 MGA each) paid in cash. */
  async function sell() {
    const quote = await post('/quotes', cookies.sales, {
      customerId: customer,
      lines: [{ productUnitId: await unitId(t.db, 'CLO-001', 'kg'), qty: '2', discount: null }],
      orderDiscount: null,
    });
    const { id } = quoteSchema.parse(quote.json());
    await post(`/orders/${id}/submit`, cookies.sales, { version: 1 });
    await post(`/orders/${id}/call`, cookies.cashier);
    const paid = await post(
      `/orders/${id}/pay`,
      cookies.cashier,
      {
        version: 3,
        lines: [{ methodId: methods['CASH'], amount: '13000', reference: null }],
        cashReceived: null,
      },
      randomUUID(),
    );
    expect(paid.statusCode, paid.body).toBe(200);
  }

  it('writes the invoices and their lines with French headers and native numbers', async () => {
    await sell();
    const file = await download('sales', cookies.owner);
    expect(file.statusCode, file.body).toBe(200);
    expect(file.headers['content-disposition']).toBe(
      `attachment; filename="ventes-${today()}-${today()}.xlsx"`,
    );
    const book = await workbook(file.rawPayload);
    const [invoices, lines] = EXPORTS.sales.sheets;
    const heads = book.getWorksheet(invoices!.name)!;
    expect(heads.getRow(1).values).toEqual([undefined, ...invoices!.columns.map(([h]) => h)]);
    expect(heads.rowCount).toBe(2);
    expect(heads.getCell('K2').value).toBe(13000);
    expect(heads.getCell('K2').numFmt).toBe('#,##0.00');
    expect(heads.getCell('B2').value).toBeInstanceOf(Date);
    const detail = book.getWorksheet(lines!.name)!;
    expect(detail.getCell('F2').value).toBe(2);
    expect(detail.getCell('F2').numFmt).toBe('#,##0');
    expect(detail.getCell('N2').value).toBe(13000);
  });

  it('gives the owner every kind, the cashier their own closings, the admin the journal', async () => {
    for (const kind of EXPORT_KINDS) {
      const file = await download(kind, cookies.owner);
      expect(file.statusCode, `${kind}: ${file.body}`).toBe(200);
      expect(file.rawPayload.subarray(0, 2).toString()).toBe('PK');
    }
    const closings = await download('closings', cookies.cashier);
    expect(closings.statusCode, closings.body).toBe(200);
    const sessions = (await workbook(closings.rawPayload)).getWorksheet('Sessions')!;
    expect(sessions.rowCount).toBe(2);
    expect(sessions.getCell('B2').value).toBe('User soa');
    expect((await download('sales', cookies.cashier)).statusCode).toBe(403);
    expect((await download('audit', cookies.admin)).statusCode).toBe(200);
    expect((await download('sales', cookies.admin)).statusCode).toBe(403);
    expect((await download('closings', cookies.sales)).statusCode).toBe(403);
  });

  it('refuses a period upside down or longer than a year', async () => {
    expect((await download('sales', cookies.owner, '2026-10-19', '2026-10-01')).statusCode).toBe(
      400,
    );
    expect((await download('sales', cookies.owner, '2025-01-01', '2026-10-19')).statusCode).toBe(
      400,
    );
    expect((await download('unknown', cookies.owner)).statusCode).toBe(400);
  });
});
