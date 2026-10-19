/**
 * Catalog import from Excel (T-020; RG-IMP-01 à 08, annexe A): one row per product × sale unit,
 * shown line by line as it will be recorded, then committed in one transaction or cancelled.
 * Money and quantities travel as decimal strings (RG-FMT-01).
 */
import { z } from 'zod';

import { customerTypeSchema, type CustomerType } from './customers.js';

export const IMPORT_MODES = ['ENTRY', 'STOCKTAKE'] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];
export const IMPORT_STATUSES = ['PREVIEW', 'COMMITTED', 'CANCELLED'] as const;
/** The file travels base64 in the JSON body: 10 MB of spreadsheet at most. */
export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;
/** A price moving more than this, up or down, is flagged before validation (RG-IMP-04). */
export const IMPORT_PRICE_JUMP_PCT = 30;
/** Annexe A: the columns a file must carry; the others are optional. */
export const IMPORT_REQUIRED_COLUMNS = [
  'code',
  'categorie',
  'designation',
  'unite',
  'quantite',
] as const;
/** Optional columns: the price of a customer type, which wins over `prix_vente` (H66). */
export const IMPORT_TYPE_PRICE_COLUMNS = {
  prix_grossiste: 'WHOLESALER',
  prix_semi_grossiste: 'SEMI_WHOLESALER',
  prix_detaillant: 'RETAILER',
  prix_particulier: 'INDIVIDUAL',
} as const satisfies Record<string, CustomerType>;

export const importUploadSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/\.(xlsx|csv)$/i),
  mode: z.enum(IMPORT_MODES),
  entryDate: z.iso.date(),
  content: z
    .base64()
    .min(1)
    .max(Math.ceil(IMPORT_MAX_BYTES / 3) * 4),
});
export type ImportUpload = z.infer<typeof importUploadSchema>;

/** RG-IMP-05: all or nothing, or the valid lines only with the others reported. */
export const importCommitSchema = z.object({ validOnly: z.boolean().default(false) });
export type ImportCommit = z.infer<typeof importCommitSchema>;

/** Blocking errors of a line (RG-IMP-04); SIBLING_ERROR: another line of the same code fails. */
export const IMPORT_ERRORS = [
  'CODE_MISSING',
  'UNIT_MISSING',
  'NAME_MISSING',
  'CATEGORY_MISSING',
  'QTY_INVALID',
  'FACTOR_INVALID',
  'PRICE_INVALID',
  'THRESHOLD_INVALID',
  'ACTIVE_INVALID',
  'DUPLICATE_UNIT',
  'NAME_CONFLICT',
  'CATEGORY_CONFLICT',
  'NO_BASE_UNIT',
  'TWO_BASE_UNITS',
  'BASE_UNIT_MISMATCH',
  'FACTOR_LOCKED',
  'UNIT_LIMIT',
  'BARCODE_TAKEN',
  'BELOW_RESERVED',
  'TEXT_TOO_LONG',
  'SIBLING_ERROR',
] as const;
export type ImportError = (typeof IMPORT_ERRORS)[number];
export const IMPORT_WARNINGS = ['NO_PRICE', 'NEW_CATEGORY', 'PRICE_JUMP'] as const;
export type ImportWarning = (typeof IMPORT_WARNINGS)[number];

const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/);
const action = z.enum(['create', 'update']).nullable();

export const importLineSchema = z.object({
  /** The row of the sheet, as the spreadsheet numbers it. */
  row: z.number().int(),
  sku: z.string(),
  unit: z.string(),
  product: action,
  unitAction: action,
  qty: decimalString.nullable(),
  /** The quantity in base unit (RG-ART-06). */
  baseQty: decimalString.nullable(),
  /** On the first line of each code only: the product's stock before → after. */
  stockBefore: decimalString.nullable(),
  stockAfter: decimalString.nullable(),
  priceBefore: decimalString.nullable(),
  /** The new price, only when it differs from the one in force (RG-ART-07). */
  price: decimalString.nullable(),
  /** The new prices of customer types, only those that differ from the ones in force (H66). */
  typePrices: z.partialRecord(customerTypeSchema, decimalString).optional(),
  errors: z.array(z.enum(IMPORT_ERRORS)),
  warnings: z.array(z.enum(IMPORT_WARNINGS)),
});
export type ImportLine = z.infer<typeof importLineSchema>;

/** What the valid lines record (RG-IMP-04 totals). */
export const importTotalsSchema = z.object({
  productsCreated: z.number().int(),
  productsUpdated: z.number().int(),
  unitsCreated: z.number().int(),
  qtyIn: decimalString,
  pricesChanged: z.number().int(),
});
export type ImportTotals = z.infer<typeof importTotalsSchema>;

/** One import of the history (RG-IMP-06). */
export const importBatchSchema = z.object({
  id: z.uuid(),
  fileName: z.string(),
  mode: z.enum(IMPORT_MODES),
  status: z.enum(IMPORT_STATUSES),
  entryDate: z.iso.date(),
  userName: z.string(),
  createdAt: z.iso.datetime(),
  committedAt: z.iso.datetime().nullable(),
  rowsTotal: z.number().int(),
  rowsOk: z.number().int(),
  rowsError: z.number().int(),
  totals: importTotalsSchema,
});
export type ImportBatch = z.infer<typeof importBatchSchema>;

export const importDetailSchema = importBatchSchema.extend({ lines: z.array(importLineSchema) });
export type ImportDetail = z.infer<typeof importDetailSchema>;

export const importListSchema = z.object({ items: z.array(importBatchSchema) });
export type ImportList = z.infer<typeof importListSchema>;
