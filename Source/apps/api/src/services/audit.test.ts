import { describe, expect, it, vi } from 'vitest';

import { recordAudit, type AuditTx } from './audit.js';

function fakeTx() {
  const create = vi.fn().mockResolvedValue(undefined);
  // Only `auditLog.create` is exercised: the rest of the client is irrelevant to this unit.
  const tx = { auditLog: { create } } as unknown as AuditTx;
  return { tx, create };
}

describe('recordAudit (RG-AUD-01: who, when, what, before → after; never a secret)', () => {
  it('writes one row with nulls for the absent context fields', async () => {
    const { tx, create } = fakeTx();
    await recordAudit(tx, { action: 'auth.login_failed', entityType: 'user', entityId: 'u1' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]).toEqual({
      data: {
        userId: null,
        activeRole: null,
        stationId: null,
        origin: null,
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: 'u1',
        reason: null,
      },
    });
  });

  it('keeps the snapshots and the actor when given', async () => {
    const { tx, create } = fakeTx();
    await recordAudit(tx, {
      userId: 'adm',
      activeRole: 'admin',
      stationId: null,
      origin: 'LAN',
      action: 'user.pin_set',
      entityType: 'user',
      entityId: 'u1',
      before: { hasPin: false },
      after: { hasPin: true },
      reason: 'first PIN',
    });
    expect(create.mock.calls[0]?.[0]).toEqual({
      data: {
        userId: 'adm',
        activeRole: 'admin',
        stationId: null,
        origin: 'LAN',
        action: 'user.pin_set',
        entityType: 'user',
        entityId: 'u1',
        before: { hasPin: false },
        after: { hasPin: true },
        reason: 'first PIN',
      },
    });
  });

  it('accepts flags about secrets but refuses their values', async () => {
    const { tx, create } = fakeTx();
    await recordAudit(tx, {
      action: 'user.totp_reset',
      entityType: 'user',
      before: { totpEnabled: true, totpSecret: null },
      after: { totpEnabled: false },
    });
    expect(create).toHaveBeenCalledTimes(1);

    for (const snapshot of [
      { pinHash: '$argon2id$…' },
      { password: 'Boss-1234!' },
      { totpSecret: 'JBSWY3DP' },
      { sessionToken: 'abc' },
      { code: 123456 },
    ]) {
      await expect(
        recordAudit(tx, { action: 'x', entityType: 'user', after: snapshot }),
      ).rejects.toThrow(/would store a secret/);
      await expect(
        recordAudit(tx, { action: 'x', entityType: 'user', before: snapshot }),
      ).rejects.toThrow(/would store a secret/);
    }
    expect(create).toHaveBeenCalledTimes(1);
  });
});
