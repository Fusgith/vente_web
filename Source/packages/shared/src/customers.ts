/**
 * Customer directory (RG-DEV-04): name and phone are mandatory, one active record per phone.
 * Contracts shared by the API and the PWA; the phone rules are ⚠️ H26.
 */
import { z } from 'zod';

/** At most 8 customers in the picker, all visible without scrolling, like the product search. */
export const CUSTOMER_SEARCH_MAX_RESULTS = 8;
/** A name search starts at the 2nd character, a phone search at the 3rd digit. */
export const CUSTOMER_NAME_MIN_LENGTH = 2;
export const CUSTOMER_PHONE_MIN_DIGITS = 3;
export const CUSTOMER_NAME_MAX_LENGTH = 120;

const MG_COUNTRY = '261';
/** Separators people type in a phone number; anything else makes it invalid. */
const PHONE_SEPARATORS = /[\s.\-/()]/g;

/** Leading `+261`, `00261` or bare `261` + 9 digits: the Malagasy number, written from `0`. */
function localDigits(digits: string): string {
  if (digits.startsWith('00')) return localDigits(`+${digits.slice(2)}`);
  if (digits.startsWith(`+${MG_COUNTRY}`)) return `0${digits.slice(MG_COUNTRY.length + 1)}`;
  if (digits.startsWith(MG_COUNTRY) && digits.length === 12) return `0${digits.slice(3)}`;
  return digits;
}

/**
 * One stored form per phone, so that the directory can spot a known number (RG-DEV-04):
 * a Malagasy number as its 10 digits from `0` (`+261 34 12 345 67` → `0341234567`), a foreign
 * one as `+` and 8 to 15 digits. Null when the text is not a phone number (⚠️ H26).
 */
export function normalizePhone(raw: string): string | null {
  const compact = raw.trim().replace(PHONE_SEPARATORS, '');
  if (!/^\+?\d+$/.test(compact)) return null;
  const phone = localDigits(compact);
  if (/^0\d{9}$/.test(phone)) return phone;
  if (/^\+\d{8,15}$/.test(phone) && !phone.startsWith(`+${MG_COUNTRY}`)) return phone;
  return null;
}

/** `0341234567` → `034 12 345 67`, the way numbers are written in Madagascar; others as stored. */
export function formatPhone(phone: string): string {
  const match = /^(0\d{2})(\d{2})(\d{3})(\d{2})$/.exec(phone);
  return match ? match.slice(1).join(' ') : phone;
}

/**
 * The digits of a search typed as a phone number (`034 12`, `+261 34`), from `0` like the stored
 * form; null when the text holds anything but a phone number, or too few digits to search.
 */
export function phoneSearchDigits(term: string): string | null {
  const compact = term.trim().replace(PHONE_SEPARATORS, '');
  if (!/^\+?\d+$/.test(compact)) return null;
  const digits = localDigits(compact).replace('+', '');
  return digits.length >= CUSTOMER_PHONE_MIN_DIGITS ? digits : null;
}

const phoneSchema = z
  .string()
  .max(32)
  .transform((raw, ctx) => {
    const phone = normalizePhone(raw);
    if (phone === null) {
      ctx.addIssue({ code: 'custom', message: 'invalid_phone' });
      return z.NEVER;
    }
    return phone;
  });

/** Trimmed, inner spaces collapsed: « Rakoto  Jean » and « Rakoto Jean » are the same name. */
const nameSchema = z
  .string()
  .transform((raw) => raw.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1).max(CUSTOMER_NAME_MAX_LENGTH));

export const customerCreateSchema = z.object({ name: nameSchema, phone: phoneSchema });
export type CustomerCreate = z.infer<typeof customerCreateSchema>;
export type CustomerCreateInput = z.input<typeof customerCreateSchema>;

export const customerUpdateSchema = z
  .object({ name: nameSchema.optional(), phone: phoneSchema.optional() })
  .refine((body) => body.name !== undefined || body.phone !== undefined, 'nothing_to_update');
export type CustomerUpdate = z.infer<typeof customerUpdateSchema>;

/** The record `:id` is merged into `intoId`, which keeps living (RG-DEV-04). */
export const customerMergeSchema = z.object({ intoId: z.uuid() });

export const customerSearchQuerySchema = z.object({ q: z.string().trim().min(1).max(100) });

export const customerSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Stored form (`normalizePhone`); shown with `formatPhone`. */
  phone: z.string(),
  /** False once deactivated or merged: never offered for a new quote. */
  isActive: z.boolean(),
  /** The record that replaced this one after a merge. */
  mergedIntoId: z.uuid().nullable(),
});
export type Customer = z.infer<typeof customerSchema>;

export const customerSearchResultSchema = z.object({
  items: z.array(customerSchema).max(CUSTOMER_SEARCH_MAX_RESULTS),
  /** More customers match than shown: ask to refine the search. */
  more: z.boolean(),
});
export type CustomerSearchResult = z.infer<typeof customerSearchResultSchema>;
