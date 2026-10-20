import { z } from 'zod';

const legalField = z.string().trim().max(300);
const prefix = z.string().regex(/^[A-Z0-9]{1,6}$/);
const days = z.int().min(1).max(365);
const minutes = z.int().min(1).max(120);
/** A list proposed to choose from: a category, a reason… */
const choices = z.array(z.string().trim().min(1).max(60)).min(1).max(30);

/**
 * The settings the admin sets on the « Paramètres » screen (CDC métier §13, T-013), each checked
 * against its own schema. The general cap, the reservation duration and the salesperson's
 * discounts have their own panels; the payment methods and the stations theirs.
 */
export const SETTING_SCHEMAS = {
  'store.legal': z
    .object({
      name: legalField,
      address: legalField,
      phone: legalField,
      nif: legalField,
      stat: legalField,
      rcs: legalField,
      footer: legalField,
    })
    .strict(),
  vat_enabled: z.boolean(),
  vat_rate: z.number().min(0).max(100),
  vat_notice: z.string().trim().max(120),
  // RG-FMT-04 (H70): 'none', or the step in Ariary the cash part is rounded to.
  cash_rounding: z.union([z.literal('none'), z.int().min(1).max(10_000)]),
  invoice_prefix: prefix,
  credit_note_prefix: prefix,
  quote_prefix: prefix,
  day_end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  quote_validity_days: days,
  promo_code_days: days,
  'discount_code.length': z.int().min(6).max(12),
  customer_categories: choices,
  discount_reasons: choices,
  adjustment_reasons: choices,
  'display.enabled': z.boolean(),
  'display.sound': z.boolean(),
  'display.last_calls': z.int().min(1).max(20),
  // RG-BOR-06: the kiosk's idle reset and its baskets per hour.
  'kiosk.idle_seconds': z.int().min(30).max(600),
  'kiosk.max_baskets_per_hour': z.int().min(1).max(200),
  'session.lock_minutes.tablet': minutes,
  'session.lock_minutes.register': minutes,
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export const SETTING_KEYS = Object.keys(SETTING_SCHEMAS) as SettingKey[];

/** Each setting's value, or null while it has never been set. */
export const settingsSchema = z.object({
  values: z.record(z.enum(SETTING_KEYS), z.unknown()),
});
export type Settings = z.infer<typeof settingsSchema>;

export const settingUpdateSchema = z.object({ value: z.unknown() }).strict();
