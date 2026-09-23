import type { AccessOrigin, AuthMethod, Role } from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { User } from '../generated/prisma/client.js';
import type { AuditEntry } from './audit.js';
import type { FailureContext } from './lockout.js';

/** The authenticated caller, as the audit log records it (RG-AUD-01). */
export interface Actor {
  userId: string;
  sessionId: string;
  activeRole: Role;
  stationId: string | null;
  origin: AccessOrigin;
  authMethod: AuthMethod;
}

type ActorFields = Pick<AuditEntry, 'userId' | 'activeRole' | 'stationId' | 'origin'>;

export function by(actor: Actor): ActorFields {
  return {
    userId: actor.userId,
    activeRole: actor.activeRole,
    stationId: actor.stationId,
    origin: actor.origin,
  };
}

export function failureContext(actor: Actor, reason: string): FailureContext {
  return { origin: actor.origin, role: actor.activeRole, stationId: actor.stationId, reason };
}

export async function loadUser(db: Db, id: string): Promise<User> {
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, 'NOT_FOUND');
  return user;
}
