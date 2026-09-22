import type { AccessOrigin, AuthMethod, Role } from '@vente-web/shared';
import { describe, expect, it } from 'vitest';

import type { StationType } from '../generated/prisma/enums.js';
import type { AuthContext } from './sessions.js';
import { switchRoleError } from './switch-role.js';

interface FakeContext {
  roles: Role[];
  activeRole: Role;
  origin?: AccessOrigin;
  authMethod?: AuthMethod;
  stationType?: StationType | null;
}

function context(input: FakeContext): AuthContext {
  return {
    user: { id: 'u1', username: 'vola', fullName: 'Vola', roles: input.roles, totpEnabled: false },
    session: {
      id: 's1',
      activeRole: input.activeRole,
      origin: input.origin ?? 'LAN',
      authMethod: input.authMethod ?? 'PIN',
      stationId: input.stationType ? 'st1' : null,
      stationType: input.stationType ?? null,
      expiresAt: new Date(0),
    },
    idleMinutes: 15,
  };
}

describe('switchRoleError (CDC technique §8, T3)', () => {
  it('allows a held operational role from a PIN session in the shop', () => {
    const auth = context({ roles: ['sales', 'cashier'], activeRole: 'sales' });
    expect(switchRoleError(auth, 'cashier')).toBeNull();
    expect(switchRoleError(auth, 'sales')).toBeNull();
  });

  it('refuses a role the account does not hold, before any other rule', () => {
    const auth = context({ roles: ['sales'], activeRole: 'sales' });
    expect(switchRoleError(auth, 'manager')?.code).toBe('AUTH_FORBIDDEN');
    expect(switchRoleError(auth, 'admin')?.code).toBe('AUTH_FORBIDDEN');
  });

  it('never elevates a PIN session to owner/admin', () => {
    const auth = context({ roles: ['sales', 'admin', 'owner'], activeRole: 'sales' });
    expect(switchRoleError(auth, 'admin')?.code).toBe('AUTH_REAUTH_REQUIRED');
    expect(switchRoleError(auth, 'owner')?.code).toBe('AUTH_REAUTH_REQUIRED');
    const password = context({
      roles: auth.user.roles,
      activeRole: 'sales',
      authMethod: 'PASSWORD',
    });
    expect(switchRoleError(password, 'admin')).toBeNull();
  });

  it('keeps a remote session on remote roles', () => {
    const auth = context({
      roles: ['owner', 'admin', 'sales'],
      activeRole: 'owner',
      origin: 'REMOTE',
      authMethod: 'PASSWORD_TOTP',
    });
    expect(switchRoleError(auth, 'admin')).toBeNull();
    expect(switchRoleError(auth, 'sales')?.code).toBe('AUTH_ROLE_REMOTE_FORBIDDEN');
  });

  it('respects the station the session is bound to (H21)', () => {
    const tablet = context({
      roles: ['sales', 'cashier', 'manager'],
      activeRole: 'sales',
      stationType: 'SALES',
    });
    expect(switchRoleError(tablet, 'cashier')?.code).toBe('STATION_INVALID');
    expect(switchRoleError(tablet, 'manager')).toBeNull();
    const unbound = context({
      roles: ['sales', 'cashier'],
      activeRole: 'sales',
      stationType: null,
    });
    expect(switchRoleError(unbound, 'cashier')).toBeNull();
  });
});
