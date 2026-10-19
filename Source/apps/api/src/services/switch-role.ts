import { isRemoteRole, type AuthMe, type Role } from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { recordAudit } from './audit.js';
import { stationAcceptsRole } from './login.js';
import { idleMinutesFor, toAuthMe, type AuthContext } from './sessions.js';
import { pairingRequired } from './stations.js';

/**
 * Changes the active role of the session without a new login. A PIN session (opened before
 * H57, gone within 12 h) never reaches owner/admin (CDC technique §8) and a remote session never takes an operational role (T3).
 */
export function switchRoleError(auth: AuthContext, role: Role): AppError | null {
  if (!auth.user.roles.includes(role)) return new AppError(403, 'AUTH_FORBIDDEN');
  if (isRemoteRole(role) && auth.session.authMethod === 'PIN') {
    return new AppError(403, 'AUTH_REAUTH_REQUIRED');
  }
  if (auth.session.origin === 'REMOTE' && !isRemoteRole(role)) {
    return new AppError(403, 'AUTH_ROLE_REMOTE_FORBIDDEN');
  }
  if (auth.session.stationType && !stationAcceptsRole(auth.session.stationType, role)) {
    return new AppError(400, 'STATION_INVALID');
  }
  return null;
}

export async function switchRole(db: Db, auth: AuthContext, role: Role): Promise<AuthMe> {
  const error = switchRoleError(auth, role);
  if (error) throw error;
  // A device left unpaired once pairing is on opens only the remote roles (RG-USR-09, H71).
  const { origin, stationId } = auth.session;
  if (origin === 'LAN' && !stationId && !isRemoteRole(role) && (await pairingRequired(db))) {
    throw new AppError(400, 'STATION_REQUIRED');
  }
  const previous = auth.session.activeRole;
  if (role !== previous) {
    await db.$transaction(async (tx) => {
      // The session may have been revoked since the request was authenticated.
      const updated = await tx.session.updateMany({
        where: { id: auth.session.id },
        data: { activeRole: role },
      });
      if (updated.count === 0) throw new AppError(401, 'AUTH_REQUIRED');
      await recordAudit(tx, {
        userId: auth.user.id,
        activeRole: previous,
        stationId: auth.session.stationId,
        origin: auth.session.origin,
        action: 'auth.role_switched',
        entityType: 'session',
        entityId: auth.session.id,
        before: { activeRole: previous },
        after: { activeRole: role },
      });
    });
  }
  const next: AuthContext = {
    ...auth,
    session: { ...auth.session, activeRole: role },
    idleMinutes: await idleMinutesFor(db, auth.session.origin, auth.session.stationType),
  };
  return toAuthMe(next);
}
