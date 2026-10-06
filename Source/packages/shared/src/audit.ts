import { z } from 'zod';

import { accessOriginSchema, roleSchema } from './auth.js';

/** What the audit log's reader narrows it to (T-014, RG-AUD-01). */
export const AUDIT_SUBJECTS = [
  'orders',
  'customers',
  'discounts',
  'stock',
  'registers',
  'accounts',
  'sessions',
] as const;
export const auditSubjectSchema = z.enum(AUDIT_SUBJECTS);
export type AuditSubject = (typeof AUDIT_SUBJECTS)[number];

/** One shop day at a time, the latest first; `before` pages to the older entries. */
export const auditQuerySchema = z.object({
  /** The shop's day read; today when absent. */
  day: z.iso.date().optional(),
  subject: auditSubjectSchema.optional(),
  /** Identifier of the account that acted. */
  user: z.string().trim().min(1).max(64).optional(),
  /** The last entry already shown: the next page starts just before it. */
  before: z.uuid().optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

/** Who, when, what, before → after, why (RG-AUD-01); secrets never reach it. */
export const auditEntrySchema = z.object({
  id: z.uuid(),
  at: z.iso.datetime({ offset: true }),
  /** None for an attempt by someone unknown, e.g. a failed login with a wrong identifier. */
  user: z.object({ username: z.string(), fullName: z.string() }).nullable(),
  activeRole: roleSchema.nullable(),
  origin: accessOriginSchema.nullable(),
  /** Dotted verb, e.g. `order.paid`. */
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  before: z.unknown(),
  after: z.unknown(),
  reason: z.string().nullable(),
});
export type AuditLogEntry = z.infer<typeof auditEntrySchema>;

export const auditPageSchema = z.object({
  entries: z.array(auditEntrySchema),
  /** Older entries remain on that day. */
  more: z.boolean(),
});
export type AuditPage = z.infer<typeof auditPageSchema>;
