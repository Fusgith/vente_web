// Demo seed — idempotent: safe to run again on a database it already populated.
// Run with `pnpm --filter @vente-web/api db:seed` (or `prisma migrate reset`).
// Never run against production: it creates fictitious users, customers and stock.

import { config as loadDotenv } from 'dotenv';

import { createDb, type Db } from '../src/db.js';
import { hashSecret } from '../src/services/password-hash.js';
import {
  CATEGORIES,
  CUSTOMERS,
  PAYMENT_METHODS,
  PRODUCTS,
  SETTINGS,
  STATIONS,
  USERS,
} from './seed/data.js';
import { seedCatalog } from './seed/catalog.js';

loadDotenv({ path: new URL('../../../.env', import.meta.url), quiet: true });

async function seedSettings(db: Db): Promise<void> {
  for (const [key, value] of Object.entries(SETTINGS)) {
    await db.setting.upsert({
      where: { key },
      create: { key, value: value as object },
      update: {}, // an admin may have changed it: keep the stored value (RG-AUD-01 audits changes)
    });
  }
}

async function seedPaymentMethods(db: Db): Promise<void> {
  for (const [index, method] of PAYMENT_METHODS.entries()) {
    await db.paymentMethod.upsert({
      where: { code: method.code },
      create: { ...method, sortOrder: index + 1 },
      update: {},
    });
  }
}

async function seedUsers(db: Db): Promise<void> {
  for (const user of USERS) {
    const credentials = {
      pinHash: user.pin ? await hashSecret(user.pin) : null,
      passwordHash: user.password ? await hashSecret(user.password) : null,
      totpSecret: user.totpSecret ?? null,
      totpEnabledAt: user.totpSecret ? new Date() : null,
    };
    const existing = await db.user.findUnique({
      where: { username: user.username },
      select: { id: true, pinHash: true, passwordHash: true },
    });
    if (!existing) {
      await db.user.create({
        data: {
          username: user.username,
          fullName: user.fullName,
          roles: user.roles,
          ticketLetter: user.ticketLetter ?? null,
          ...credentials,
        },
      });
    } else if (existing.pinHash === null && existing.passwordHash === null) {
      // An account that never had a secret gets the demo ones; a changed secret is never touched.
      await db.user.update({ where: { id: existing.id }, data: credentials });
    }
  }
}

async function seedStations(db: Db): Promise<void> {
  for (const station of STATIONS) {
    const existing = await db.station.findFirst({
      where: { type: station.type, name: station.name },
    });
    if (existing) continue;
    await db.station.create({
      data: {
        type: station.type,
        name: station.name,
        displayKey: station.displayKey ?? null,
        isActive: station.isActive ?? true,
      },
    });
  }
}

async function seedCustomers(db: Db): Promise<void> {
  for (const customer of CUSTOMERS) {
    const existing = await db.customer.findFirst({
      where: { phone: customer.phone, isActive: true },
    });
    if (existing) continue;
    await db.customer.create({ data: customer });
  }
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set (see Source/.env.example)');
  if (process.env['NODE_ENV'] === 'production')
    throw new Error('Refusing to seed demo data in production');

  const db = createDb(url);
  try {
    await seedSettings(db);
    await seedPaymentMethods(db);
    await seedUsers(db);
    await seedStations(db);
    await seedCustomers(db);
    await seedCatalog(db, {
      categories: CATEGORIES,
      products: PRODUCTS,
      importedBy: 'responsable',
    });
    console.log('Demo seed applied.');
  } finally {
    await db.$disconnect();
  }
}

await main();
