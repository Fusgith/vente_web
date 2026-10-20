/**
 * The self-service kiosk (CDC métier §5.10, RG-BOR-01 à 06, T-036): a station without an
 * account that reads the sellable catalogue — name, sale units, base price, available or sold
 * out, never a stock figure nor a cap — and sends baskets a salesperson takes up as quotes.
 */
import { z } from 'zod';

import { customerCreateSchema } from './customers.js';
import { isQuantity } from './decimal.js';
import { QUOTE_MAX_LINES } from './quotes.js';

/** RG-BOR-06: the kiosk empties its basket after 2 min without a touch. */
export const KIOSK_IDLE_SECONDS = 120;
/** RG-BOR-06: at most 20 baskets per hour and per kiosk, against abuse. */
export const KIOSK_MAX_BASKETS_PER_HOUR = 20;
/** RG-BOR-04: the « sent » screen stays 30 s, then the kiosk is back home. */
export const KIOSK_SENT_SECONDS = 30;

const decimalString = z.string().regex(/^\d+(\.\d+)?$/);

export const kioskUnitSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  factor: decimalString,
  /** The base price in force (H66). */
  price: decimalString,
});
export type KioskUnit = z.infer<typeof kioskUnitSchema>;

export const kioskProductSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  soldOut: z.boolean(),
  /** Sellable units only, smallest factor first. */
  units: z.array(kioskUnitSchema),
});
export type KioskProduct = z.infer<typeof kioskProductSchema>;

export const kioskSearchResultSchema = z.object({
  /** An exact code or barcode: the line to add directly. */
  exact: z.object({ productId: z.uuid(), unitId: z.uuid() }).nullable(),
  items: z.array(kioskProductSchema),
  more: z.boolean(),
});
export type KioskSearchResult = z.infer<typeof kioskSearchResultSchema>;

/** What the kiosk loads first: its name, its idle delay and the shop's best sellers. */
export const kioskHomeSchema = z.object({
  station: z.string(),
  idleSeconds: z.int().positive(),
  favorites: z.array(kioskProductSchema),
});
export type KioskHome = z.infer<typeof kioskHomeSchema>;

export const kioskBasketLineSchema = z.object({
  productUnitId: z.uuid(),
  qty: z.string().refine(isQuantity),
});
export type KioskBasketLine = z.infer<typeof kioskBasketLineSchema>;

/** RG-BOR-03: the customer's name and phone; no discount at the kiosk (RG-BOR-02). */
export const kioskBasketInputSchema = z
  .object({
    name: customerCreateSchema.shape.name,
    phone: customerCreateSchema.shape.phone,
    lines: z
      .array(kioskBasketLineSchema)
      .min(1)
      .max(QUOTE_MAX_LINES)
      .refine((lines) => new Set(lines.map((line) => line.productUnitId)).size === lines.length),
  })
  .strict();
export type KioskBasketInput = z.input<typeof kioskBasketInputSchema>;

/** The basket number of the day, as the kiosk shows it and the salesperson calls it: « P12 ». */
export const basketLabel = (seq: number) => `P${seq}`;

export const kioskBasketSentSchema = z.object({ basket: z.string() });
export type KioskBasketSent = z.infer<typeof kioskBasketSentSchema>;

/** A basket waiting for a salesperson (RG-BOR-04): number, name, lines, amount, waiting since. */
export const kioskBasketSchema = z.object({
  id: z.uuid(),
  basket: z.string(),
  name: z.string(),
  lineCount: z.int().positive(),
  total: decimalString,
  createdAt: z.iso.datetime({ offset: true }),
});
export type KioskBasket = z.infer<typeof kioskBasketSchema>;

export const kioskBasketListSchema = z.object({ items: z.array(kioskBasketSchema) });
export type KioskBasketList = z.infer<typeof kioskBasketListSchema>;

/** Taking a basket up gives the quote it became, in the salesperson's name (RG-BOR-05). */
export const kioskBasketTakenSchema = z.object({ quoteId: z.uuid() });
export type KioskBasketTaken = z.infer<typeof kioskBasketTakenSchema>;
