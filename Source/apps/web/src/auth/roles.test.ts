import type { Role } from '@vente-web/shared';
import { describe, expect, it } from 'vitest';

import { HERY, meFor } from '../test/fake-api.js';
import { switchableRoles } from './roles.js';

const HELD: Role[] = ['admin', 'manager', 'cashier', 'owner'];
const EVERYTHING = { ...HERY, roles: HELD };

describe('switchableRoles (RG-USR-02, RG-USR-04)', () => {
  it('offers the roles held, in the usual order', () => {
    expect(switchableRoles(meFor({ user: HERY, activeRole: 'cashier' }))).toEqual([
      'manager',
      'cashier',
    ]);
  });

  it('keeps owner and admin out of reach of a PIN session opened before H57', () => {
    const me = meFor({ user: EVERYTHING, activeRole: 'manager', authMethod: 'PIN' });
    expect(switchableRoles(me)).toEqual(['manager', 'cashier']);
  });

  it('lets a password session in the shop take any role held', () => {
    const me = meFor({
      user: EVERYTHING,
      activeRole: 'admin',
      authMethod: 'PASSWORD',
    });
    expect(switchableRoles(me)).toEqual(['admin', 'manager', 'cashier', 'owner']);
  });

  it('limits a remote session to owner and admin', () => {
    const me = meFor({
      user: EVERYTHING,
      activeRole: 'owner',
      authMethod: 'PASSWORD_TOTP',
      origin: 'REMOTE',
    });
    expect(switchableRoles(me)).toEqual(['admin', 'owner']);
  });
});
