/**
 * Accounts managed by the admin (T-016, CDC métier §3, annexe B): created and changed, never
 * deleted (RG-USR-06); fixed roles, one or several (RG-USR-01/02).
 */
import { z } from 'zod';

import { passwordSchema, roleSchema, USERNAME_MAX_LENGTH } from './auth.js';

export const FULL_NAME_MAX_LENGTH = 120;
/** A sales user's ticket letter (RG-USR-07, RG-TKT-01). */
export const TICKET_LETTER_PATTERN = /^[A-Z]$/;

/** Typed on a shared station's keyboard: no spaces inside (RG-USR-03, H48). */
const usernameSchema = z.string().trim().min(1).max(USERNAME_MAX_LENGTH).regex(/^\S+$/);
const fullNameSchema = z.string().trim().min(1).max(FULL_NAME_MAX_LENGTH);
const rolesSchema = z
  .array(roleSchema)
  .min(1)
  .refine((roles) => new Set(roles).size === roles.length, 'roles must be distinct');
const ticketLetterSchema = z.string().trim().toUpperCase().regex(TICKET_LETTER_PATTERN);

/** An account as the admin sees it: whether a secret exists, never the secret itself. */
export const userAccountSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  fullName: z.string(),
  roles: z.array(roleSchema),
  ticketLetter: z.string().nullable(),
  isActive: z.boolean(),
  hasPin: z.boolean(),
  hasPassword: z.boolean(),
  /** Set by the admin: replaced by the user's own at the next login (H20). */
  passwordChangeRequired: z.boolean(),
  totpEnabled: z.boolean(),
  lockedUntil: z.iso.datetime().nullable(),
});
export type UserAccount = z.infer<typeof userAccountSchema>;

export const userAccountListSchema = z.object({ users: z.array(userAccountSchema) });
export type UserAccountList = z.infer<typeof userAccountListSchema>;

/** A new account: its secrets are set afterwards (PIN, password, or the owner's activation code). */
export const createUserBodySchema = z
  .object({
    username: usernameSchema,
    fullName: fullNameSchema,
    roles: rolesSchema,
    ticketLetter: ticketLetterSchema.nullable().optional(),
  })
  .strict();
export type CreateUserBody = z.infer<typeof createUserBodySchema>;

/** Only the fields given change; a change of roles or a deactivation closes the sessions. */
export const updateUserBodySchema = z
  .object({
    username: usernameSchema.optional(),
    fullName: fullNameSchema.optional(),
    roles: rolesSchema.optional(),
    ticketLetter: ticketLetterSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'nothing to change');
export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;

/** The owner's activation code (RG-USR-10): 12 characters grouped by 4, valid 24 h. */
export const ACTIVATION_CODE_LENGTH = 12;
export const ACTIVATION_HOURS = 24;

/** Shown once to the admin, who hands it to the owner; only its hash is kept. */
export const activationCodeSchema = z.object({ code: z.string(), expiresAt: z.iso.datetime() });
export type ActivationCode = z.infer<typeof activationCodeSchema>;

/** The owner chooses their password with the code: the admin never knows it (RG-USR-10). */
export const activateBodySchema = z
  .object({
    username: z.string().trim().min(1).max(USERNAME_MAX_LENGTH),
    code: z.string().trim().min(1).max(32),
    password: passwordSchema,
  })
  .strict();
export type ActivateBody = z.infer<typeof activateBodySchema>;
