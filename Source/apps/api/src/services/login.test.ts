import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { loginShapeError, stationAcceptsRole, usernameDigest } from './login.js';

describe('loginShapeError (RG-USR-03, RG-USR-04, T3: decided before any account lookup)', () => {
  it('allows a PIN in the shop for operational roles only', () => {
    expect(loginShapeError({ method: 'PIN', role: 'sales', hasTotp: false }, 'LAN')).toBeNull();
    expect(loginShapeError({ method: 'PIN', role: 'manager', hasTotp: false }, 'LAN')).toBeNull();
    expect(loginShapeError({ method: 'PIN', role: 'admin', hasTotp: false }, 'LAN')?.code).toBe(
      'AUTH_PIN_LAN_ONLY',
    );
    expect(loginShapeError({ method: 'PIN', role: 'owner', hasTotp: false }, 'LAN')?.code).toBe(
      'AUTH_PIN_LAN_ONLY',
    );
    expect(loginShapeError({ method: 'PIN', role: 'sales', hasTotp: false }, 'REMOTE')?.code).toBe(
      'AUTH_PIN_LAN_ONLY',
    );
  });

  it('allows a password in the shop for any role, with or without TOTP', () => {
    expect(
      loginShapeError({ method: 'PASSWORD', role: 'admin', hasTotp: false }, 'LAN'),
    ).toBeNull();
    expect(loginShapeError({ method: 'PASSWORD', role: 'owner', hasTotp: true }, 'LAN')).toBeNull();
    expect(
      loginShapeError({ method: 'PASSWORD', role: 'cashier', hasTotp: false }, 'LAN'),
    ).toBeNull();
  });

  it('remote: owner/admin only, password and TOTP mandatory', () => {
    expect(
      loginShapeError({ method: 'PASSWORD', role: 'owner', hasTotp: true }, 'REMOTE'),
    ).toBeNull();
    expect(
      loginShapeError({ method: 'PASSWORD', role: 'admin', hasTotp: true }, 'REMOTE'),
    ).toBeNull();
    const noTotp = loginShapeError({ method: 'PASSWORD', role: 'owner', hasTotp: false }, 'REMOTE');
    expect(noTotp?.status).toBe(401);
    expect(noTotp?.code).toBe('AUTH_TOTP_REQUIRED');
    for (const role of ['sales', 'cashier', 'warehouse', 'manager'] as const) {
      const error = loginShapeError({ method: 'PASSWORD', role, hasTotp: true }, 'REMOTE');
      expect(error?.status).toBe(403);
      expect(error?.code).toBe('AUTH_ROLE_REMOTE_FORBIDDEN');
    }
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
