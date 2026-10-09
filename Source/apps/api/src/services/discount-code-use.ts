import { groupDiscountCode, normalizeDiscountCode } from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { by, type Actor } from './actor.js';
import { recordAudit, type AuditTx } from './audit.js';
import { CODE_SELECT } from './order-view.js';

// A promo code is typed at the register only (H63); an owner's answer is used at once (H53, H64).

/**
 * The owner's code typed, as it may go on this order (RG-REM-04, H41, H42): known, active and
 * not expired, issued for this very order or for its customer.
 */
export async function usableCode(
  db: Db,
  typed: string,
  order: { id: string; customerId: string },
  now: Date,
) {
  const code = await db.discountCode.findUnique({
    where: { code: groupDiscountCode(normalizeDiscountCode(typed)) },
    select: { ...CODE_SELECT, status: true, expiresAt: true, orderId: true, customerId: true },
  });
  if (!code) throw new AppError(422, 'DISCOUNT_CODE_UNKNOWN');
  if (code.status !== 'ACTIVE' || code.expiresAt <= now) {
    throw new AppError(409, 'DISCOUNT_CODE_NOT_ACTIVE');
  }
  if (code.orderId ? code.orderId !== order.id : code.customerId !== order.customerId) {
    throw new AppError(409, 'DISCOUNT_CODE_OTHER_CUSTOMER');
  }
  return code;
}

/**
 * The code used on the order, inside its transaction (RG-REM-05): single use — of two orders
 * typing the same code, the first one takes it. Audited.
 */
export async function useCode(
  tx: AuditTx,
  actor: Actor,
  codeId: string,
  orderId: string,
  now: Date,
): Promise<void> {
  const used = await tx.discountCode.updateMany({
    where: { id: codeId, status: 'ACTIVE', expiresAt: { gt: now } },
    data: { status: 'USED', usedAt: now, usedOnOrderId: orderId },
  });
  if (used.count === 0) throw new AppError(409, 'DISCOUNT_CODE_NOT_ACTIVE');
  await recordAudit(tx, {
    ...by(actor),
    action: 'discount_code.used',
    entityType: 'discount_code',
    entityId: codeId,
    before: { status: 'ACTIVE' },
    after: { status: 'USED', orderId },
  });
}
