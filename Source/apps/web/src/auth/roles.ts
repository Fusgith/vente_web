import { ROLES, isRemoteRole, type AuthMe, type Role } from '@vente-web/shared';

/**
 * Roles the session may switch to without a new login, mirroring the API's checks (T-012):
 * a PIN session (opened before H57) never reaches owner/admin, a remote session never takes an
 * operational role. The server stays the judge; this only hides choices it would refuse.
 */
export function switchableRoles(me: AuthMe): Role[] {
  const { authMethod, origin, activeRole } = me.session;
  return ROLES.filter((role) => {
    if (!me.user.roles.includes(role)) return false;
    if (role === activeRole) return true;
    if (isRemoteRole(role) && authMethod === 'PIN') return false;
    return origin !== 'REMOTE' || isRemoteRole(role);
  });
}
