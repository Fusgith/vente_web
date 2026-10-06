import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { openingRole, stationAcceptsRole, usernameDigest } from './login.js';

describe('openingRole (RG-USR-02, H57: the account opens its role, nothing is chosen)', () => {
  it('opens the only role of a single-role account', () => {
    expect(openingRole(['cashier'], 'LAN', null)).toBe('cashier');
    expect(openingRole(['owner'], 'REMOTE', null)).toBe('owner');
  });

  it('opens the first role in ROLES order without a station', () => {
    expect(openingRole(['cashier', 'manager'], 'LAN', null)).toBe('manager');
    expect(openingRole(['warehouse', 'sales'], 'LAN', null)).toBe('sales');
  });

  it('opens the work a paired station serves, else a supervisor role it accepts', () => {
    expect(openingRole(['manager', 'cashier'], 'LAN', 'REGISTER')).toBe('cashier');
    expect(openingRole(['manager'], 'LAN', 'SALES')).toBe('manager');
    expect(openingRole(['cashier'], 'LAN', 'SALES')).toBeNull();
    expect(openingRole(['manager'], 'LAN', 'DISPLAY')).toBeNull();
  });

  it('opens only a remote role outside the shop (RG-USR-04, T3)', () => {
    expect(openingRole(['sales', 'admin'], 'REMOTE', null)).toBe('admin');
    expect(openingRole(['manager', 'cashier'], 'REMOTE', null)).toBeNull();
  });
});

describe('stationAcceptsRole (H21: one kind of work per station, supervisors anywhere)', () => {
  it('binds each operational role to its station type', () => {
    expect(stationAcceptsRole('SALES', 'sales')).toBe(true);
    expect(stationAcceptsRole('SALES', 'cashier')).toBe(false);
    expect(stationAcceptsRole('REGISTER', 'cashier')).toBe(true);
    expect(stationAcceptsRole('REGISTER', 'sales')).toBe(false);
    expect(stationAcceptsRole('DELIVERY', 'warehouse')).toBe(true);
    expect(stationAcceptsRole('DELIVERY', 'cashier')).toBe(false);
  });

  it('lets managers, admins and owners use any working station', () => {
    for (const type of ['SALES', 'REGISTER', 'DELIVERY'] as const) {
      expect(stationAcceptsRole(type, 'manager')).toBe(true);
      expect(stationAcceptsRole(type, 'admin')).toBe(true);
      expect(stationAcceptsRole(type, 'owner')).toBe(true);
    }
  });

  it('never binds a session to a public display', () => {
    for (const role of ['sales', 'cashier', 'warehouse', 'manager', 'admin', 'owner'] as const) {
      expect(stationAcceptsRole('DISPLAY', role)).toBe(false);
    }
  });
});

describe('usernameDigest (H19: unknown names reach the application log hashed)', () => {
  it('spots a repeated name without being a plain hash anyone can reverse', () => {
    const digest = usernameDigest('4271');
    expect(digest).toMatch(/^[0-9a-f]{16}$/);
    expect(usernameDigest('4271')).toBe(digest);
    expect(usernameDigest('4272')).not.toBe(digest);
    // A PIN typed in the name field: an unkeyed digest is found by trying 10 000 values.
    const plain = createHash('sha256').update('4271').digest('hex').slice(0, 16);
    expect(digest).not.toBe(plain);
  });
});
