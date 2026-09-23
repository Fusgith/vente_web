import type { AccessOrigin, TotpEnrolment } from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { Prisma, User } from '../generated/prisma/client.js';
import { by, failureContext, loadUser, type Actor } from './actor.js';
import { recordAudit, type AuditEntry } from './audit.js';
import { revokeAndAudit } from './credentials.js';
import {
  assertNotLocked,
  recordLoginFailure,
  releaseLoginAttempt,
  reserveAttemptOrThrow,
  unspentTotpStep,
  type AttemptSlot,
} from './lockout.js';
import { generateTotpSecret, totpUri, verifyTotp } from './totp.js';

/** A verified code, still to be spent: the slot ends once the step is claimed or refused. */
interface VerifiedTotp {
  step: number;
  slot: AttemptSlot;
}

async function verifyTotpAttempt(
  db: Db,
  actor: Actor,
  user: User,
  secret: string,
  lastStep: number | null,
  code: string,
  reason: string,
  now: Date,
): Promise<VerifiedTotp> {
  const slot = await reserveAttemptOrThrow(db, user.id);
  const step = verifyTotp(secret, code, { lastStep, now: now.getTime() });
  if (step !== null) return { step, slot };
  await recordLoginFailure(db, user.id, slot, failureContext(actor, reason));
  throw new AppError(401, 'AUTH_TOTP_INVALID');
}

/** The code was right but another request spent it first: a replay, counted as such. */
async function refuseReplay(db: Db, actor: Actor, user: User, slot: AttemptSlot): Promise<never> {
  await recordLoginFailure(db, user.id, slot, failureContext(actor, 'totp_replayed'));
  throw new AppError(401, 'AUTH_TOTP_INVALID');
}

/** Enrolment, start and confirmation alike: from the shop, with a password session (⚠️ H20). */
function assertCanEnrol(actor: Actor, requestOrigin: AccessOrigin): void {
  if (actor.authMethod === 'PIN') throw new AppError(403, 'AUTH_REAUTH_REQUIRED');
  if (requestOrigin !== 'LAN') throw new AppError(403, 'AUTH_LAN_ONLY');
}

interface TotpWrite {
  /** Condition the row must still satisfy: the step is spent by exactly one request. */
  where: Prisma.UserWhereInput;
  data: Prisma.UserUpdateManyMutationInput;
  /**
   * The active secret changes: the sessions opened with the old one end. Those are the remote
   * ones — the shop never asks for a TOTP code (⚠️ H20, like the admin reset).
   */
  replacesSecret?: boolean;
}

/**
 * Writes the TOTP columns and the audit row together; false when `where` no longer held. The
 * lockout columns are never reset here: a TOTP code releases its slot, and without any code
 * (`slot` null) a locked account is refused (RG-USR-05).
 */
async function storeTotp(
  db: Db,
  actor: Actor,
  user: User,
  slot: AttemptSlot | null,
  write: TotpWrite,
  entry: AuditEntry,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    if (!slot) await assertNotLocked(tx, user.id);
    const { count } = await tx.user.updateMany({
      where: { id: user.id, ...write.where },
      data: write.data,
    });
    if (count !== 1) return false;
    if (slot) await releaseLoginAttempt(tx, user.id, slot);
    await recordAudit(tx, entry);
    if (write.replacesSecret) await revokeAndAudit(tx, actor, user, { origin: 'REMOTE' });
    return true;
  });
}

/**
 * Starts (or restarts) TOTP enrolment: a fresh secret is stored as pending and becomes active
 * only once `confirmTotpEnrolment` proves the authenticator app has it. A current code is
 * required when TOTP is already active.
 */
export async function startTotpEnrolment(
  db: Db,
  actor: Actor,
  requestOrigin: AccessOrigin,
  code: string | undefined,
  now = new Date(),
): Promise<TotpEnrolment> {
  assertCanEnrol(actor, requestOrigin);
  const user = await loadUser(db, actor.userId);
  const secret = generateTotpSecret();
  const enrolled: AuditEntry = {
    ...by(actor),
    action: 'user.totp_enrolled',
    entityType: 'user',
    entityId: user.id,
    after: { totpPending: true },
  };

  if (!user.totpSecret || !user.totpEnabledAt) {
    const stored = await storeTotp(
      db,
      actor,
      user,
      null,
      { where: { totpEnabledAt: null }, data: { totpPendingSecret: secret } },
      enrolled,
    );
    // TOTP was activated meanwhile: from now on its current code is required.
    if (!stored) throw new AppError(401, 'AUTH_TOTP_REQUIRED');
    return { uri: totpUri(secret, user.username), secret };
  }

  if (code === undefined) throw new AppError(401, 'AUTH_TOTP_REQUIRED');
  const current = await verifyTotpAttempt(
    db,
    actor,
    user,
    user.totpSecret,
    user.totpLastStep,
    code,
    'totp_reenrol',
    now,
  );
  const stored = await storeTotp(
    db,
    actor,
    user,
    current.slot,
    {
      where: { totpSecret: user.totpSecret, ...unspentTotpStep(current.step) },
      data: { totpPendingSecret: secret, totpLastStep: current.step },
    },
    enrolled,
  );
  if (!stored) return refuseReplay(db, actor, user, current.slot);
  return { uri: totpUri(secret, user.username), secret };
}

export async function confirmTotpEnrolment(
  db: Db,
  actor: Actor,
  requestOrigin: AccessOrigin,
  code: string,
  now = new Date(),
): Promise<void> {
  assertCanEnrol(actor, requestOrigin);
  const user = await loadUser(db, actor.userId);
  const pending = user.totpPendingSecret;
  if (!pending) throw new AppError(400, 'AUTH_TOTP_NOT_PENDING');

  // The pending secret has never been used: no step of it is spent yet.
  const { step, slot } = await verifyTotpAttempt(
    db,
    actor,
    user,
    pending,
    null,
    code,
    'totp_confirm',
    now,
  );
  const activated = await storeTotp(
    db,
    actor,
    user,
    slot,
    {
      // Still the secret we verified: a concurrent confirmation or restart loses nothing.
      where: { totpPendingSecret: pending },
      data: {
        totpSecret: pending,
        totpPendingSecret: null,
        totpEnabledAt: now,
        totpLastStep: step,
      },
      replacesSecret: true,
    },
    {
      ...by(actor),
      action: 'user.totp_enabled',
      entityType: 'user',
      entityId: user.id,
      before: { totpEnabled: user.totpEnabledAt !== null },
      after: { totpEnabled: true },
    },
  );
  if (!activated) return refuseReplay(db, actor, user, slot);
}
