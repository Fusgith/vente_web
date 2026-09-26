/**
 * Authentication contracts shared by the API and the PWA (CDC métier §3.2, CDC technique §2.2/§8).
 * Only shapes and rules live here; the API owns the enforcement.
 */
import { z } from 'zod';

/** Fixed roles (RG-USR-01): the admin assigns them, never creates new ones. */
export const ROLES = ['admin', 'manager', 'sales', 'cashier', 'warehouse', 'owner'] as const;
export type Role = (typeof ROLES)[number];

/** Roles working on shared stations in the shop: PIN login, never remote (RG-USR-03, T3). */
export const OPERATIONAL_ROLES = ['sales', 'cashier', 'warehouse', 'manager'] as const;
export type OperationalRole = (typeof OPERATIONAL_ROLES)[number];

/** Roles allowed outside the shop, with password + TOTP (RG-USR-04). */
export const REMOTE_ROLES = ['owner', 'admin'] as const;
export type RemoteRole = (typeof REMOTE_ROLES)[number];

export function isOperationalRole(role: Role): role is OperationalRole {
  return (OPERATIONAL_ROLES as readonly Role[]).includes(role);
}

export function isRemoteRole(role: Role): role is RemoteRole {
  return (REMOTE_ROLES as readonly Role[]).includes(role);
}

/** Where a request comes from: the shop network or the tunnel (CDC technique §2.2). */
export const ACCESS_ORIGINS = ['LAN', 'REMOTE'] as const;
export type AccessOrigin = (typeof ACCESS_ORIGINS)[number];

/** How a session was opened; a PIN session never reaches owner/admin (CDC technique §8). */
export const AUTH_METHODS = ['PIN', 'PASSWORD', 'PASSWORD_TOTP'] as const;
export type AuthMethod = (typeof AUTH_METHODS)[number];

/** PIN of 4 to 6 digits (RG-USR-03). */
export const PIN_PATTERN = /^\d{4,6}$/;
/** Password length (decision H19). */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
/** TOTP: 6 digits, 30 s (RG-USR-04, RFC 6238). */
export const TOTP_PATTERN = /^\d{6}$/;
export const USERNAME_MAX_LENGTH = 64;

export const roleSchema = z.enum(ROLES);
export const accessOriginSchema = z.enum(ACCESS_ORIGINS);
export const authMethodSchema = z.enum(AUTH_METHODS);
export const pinSchema = z.string().regex(PIN_PATTERN);
export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);
export const totpCodeSchema = z.string().regex(TOTP_PATTERN);

const usernameSchema = z.string().trim().min(1).max(USERNAME_MAX_LENGTH);
/** A secret typed at login: validated for shape only, never for strength. */
const typedSecretSchema = z.string().min(1).max(PASSWORD_MAX_LENGTH);

const loginBaseSchema = z.object({
  username: usernameSchema,
  role: roleSchema,
  /** Optional until station pairing exists, then mandatory in the shop (T-015, H21). */
  stationId: z.uuid().optional(),
});

/** Login by PIN (shared stations, LAN only). */
export const pinLoginBodySchema = loginBaseSchema.extend({ pin: pinSchema }).strict();
/** Login by password; TOTP is mandatory for owner/admin outside the shop (RG-USR-04). */
export const passwordLoginBodySchema = loginBaseSchema
  .extend({ password: typedSecretSchema, totp: totpCodeSchema.optional() })
  .strict();
export const loginBodySchema = z.union([pinLoginBodySchema, passwordLoginBodySchema]);
export type PinLoginBody = z.infer<typeof pinLoginBodySchema>;
export type PasswordLoginBody = z.infer<typeof passwordLoginBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;

export const switchRoleBodySchema = z.object({ role: roleSchema }).strict();
export type SwitchRoleBody = z.infer<typeof switchRoleBodySchema>;

/** Self-service credential changes: the current secret is always re-verified (H20). */
export const changePinBodySchema = z
  .object({ current: typedSecretSchema, pin: pinSchema })
  .strict();
export const changePasswordBodySchema = z
  .object({ current: typedSecretSchema, password: passwordSchema })
  .strict();
/** Admin-set credentials (annexe B: comptes, PIN — admin only). */
export const setPinBodySchema = z.object({ pin: pinSchema }).strict();
export const setPasswordBodySchema = z.object({ password: passwordSchema }).strict();

/** TOTP enrolment: a current code is required when TOTP is already active. */
export const totpEnrolBodySchema = z.object({ code: totpCodeSchema.optional() }).strict();
export const totpConfirmBodySchema = z.object({ code: totpCodeSchema }).strict();

/** Payload of `GET /auth/me`, also returned by login and switch-role. */
export const authMeSchema = z.object({
  user: z.object({
    id: z.uuid(),
    username: z.string(),
    fullName: z.string(),
    roles: z.array(roleSchema),
    totpEnabled: z.boolean(),
  }),
  session: z.object({
    activeRole: roleSchema,
    origin: accessOriginSchema,
    authMethod: authMethodSchema,
    stationId: z.uuid().nullable(),
    expiresAt: z.iso.datetime(),
    /** Minutes of inactivity after which the session is dropped server-side (H19). */
    idleMinutes: z.number().int().positive(),
  }),
});
export type AuthMe = z.infer<typeof authMeSchema>;

/** Users selectable on a shared station before typing a PIN (RG-USR-03). */
export const authUserDirectorySchema = z.object({
  users: z.array(
    z.object({
      id: z.uuid(),
      username: z.string(),
      fullName: z.string(),
      roles: z.array(z.enum(OPERATIONAL_ROLES)),
    }),
  ),
});
export type AuthUserDirectory = z.infer<typeof authUserDirectorySchema>;

/** Result of `POST /auth/totp`: what the authenticator app needs (QR from `uri`). */
export const totpEnrolmentSchema = z.object({ uri: z.string(), secret: z.string() });
export type TotpEnrolment = z.infer<typeof totpEnrolmentSchema>;
