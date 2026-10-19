import { formatDate, formatMga, formatQty, formatTime } from '@vente-web/shared';

import { labels } from '../labels.js';

const text = labels.audit;

/** What the reader knows each id by: an order's number, a customer's name… (T-097). */
export type Refs = Record<string, string>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER = /^-?\d+(\.\d+)?$/;
/** Fields of amounts in MGA (RG-FMT-01) and of quantities. */
const AMOUNTS = new Set([
  'total',
  'unitPrice',
  'discount',
  'discountTotal',
  'net',
  'price',
  'paid',
  'amount',
  'openingFloat',
  'ceiling',
  'remaining',
]);
const QUANTITIES = new Set(['qty', 'onHand', 'reserved', 'minQty', 'alertThreshold']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const absent = (value: unknown) => value === null || value === undefined;

const field = (key: string) => text.fields[key] ?? key;

/** A value in the shop's words: names for ids, local dates, amounts in MGA, codes in French. */
function shown(value: unknown, key: string, refs: Refs): string {
  if (absent(value)) return '—';
  if (typeof value === 'boolean') return value ? text.yes : text.no;
  if (Array.isArray(value)) return value.map((item) => shown(item, key, refs)).join(' ; ');
  if (isRecord(value)) {
    // A discount entry (RG-REM-06): « 10 % » or « 1 000,00 MGA ».
    if ((value.kind === 'pct' || value.kind === 'amount') && typeof value.value === 'string') {
      return value.kind === 'pct' ? `${formatQty(value.value)} %` : formatMga(value.value);
    }
    return Object.entries(value)
      .filter(([, item]) => !absent(item))
      .map(([name, item]) => `${field(name)} ${shown(item, name, refs)}`)
      .join(', ');
  }
  const raw = String(value);
  if (UUID.test(raw)) return refs[raw] ?? raw;
  if (INSTANT.test(raw)) return `${formatDate(raw)} ${formatTime(raw)}`;
  if (DAY.test(raw)) return formatDate(raw);
  if (NUMBER.test(raw) && AMOUNTS.has(key)) return formatMga(raw);
  if (NUMBER.test(raw) && QUANTITIES.has(key)) return formatQty(raw);
  return text.values[raw] ?? raw;
}

/** The items of a list that changed, each by its rank: « Ligne 2 : … → … ». */
function itemsOf(key: string, was: unknown[], is: unknown[], refs: Refs): string[] {
  return Array.from({ length: Math.max(was.length, is.length) }, (_, index) => {
    const [from, to] = [was[index], is[index]].map((item) =>
      item === undefined ? null : shown(item, key, refs),
    );
    if (from === to) return null;
    const name = text.item(field(key), index + 1);
    return from === null ? `${name} : ${to}` : `${name} : ${from} → ${to ?? '—'}`;
  }).filter((line) => line !== null);
}

const listOfRecords = (value: unknown): value is unknown[] =>
  Array.isArray(value) && value.some(isRecord);

/**
 * « champ : avant → après » for each field that changed (RG-AUD-01), each field of a new record;
 * in the shop's words rather than ids and codes (T-097).
 */
export function changesOf(before: unknown, after: unknown, refs: Refs = {}): string[] {
  if (!isRecord(before) && !isRecord(after)) {
    if (absent(before) && absent(after)) return [];
    const [from, to] = [shown(before, '', refs), shown(after, '', refs)];
    return [absent(before) ? to : `${from} → ${to}`];
  }
  const was = isRecord(before) ? before : {};
  const is = isRecord(after) ? after : {};
  return [...new Set([...Object.keys(was), ...Object.keys(is)])].flatMap((key) => {
    if (listOfRecords(was[key]) || listOfRecords(is[key])) {
      const list = (value: unknown) => (Array.isArray(value) ? value : []);
      return itemsOf(key, list(was[key]), list(is[key]), refs);
    }
    const [from, to] = [shown(was[key], key, refs), shown(is[key], key, refs)];
    if (from === to) return [];
    return key in was ? [`${field(key)} : ${from} → ${to}`] : [`${field(key)} : ${to}`];
  });
}

/** The record an entry is about: « Commande D-2026-000042 », a setting by its key. */
export function subjectOf(entityType: string, entityId: string | null, refs: Refs): string {
  const what = text.entities[entityType] ?? entityType;
  const which = entityId && (refs[entityId] ?? (UUID.test(entityId) ? null : entityId));
  return which ? `${what} ${which}` : what;
}
