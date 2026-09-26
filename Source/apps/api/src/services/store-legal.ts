import { z } from 'zod';

import type { Db } from '../db.js';
import { readSetting } from './settings.js';

// A field missing or malformed is printed empty: a bad setting never stops a document.
const field = z.string().trim().max(300).catch('');

/** The shop's legal mentions (RG-FAC-07, setting `store.legal`); never the app's name (RG-APP-01). */
const storeLegalSchema = z.object({
  name: field,
  address: field,
  phone: field,
  nif: field,
  stat: field,
  rcs: field,
  footer: field,
});
export type StoreLegal = z.infer<typeof storeLegalSchema>;

const EMPTY: StoreLegal = storeLegalSchema.parse({});

export async function readStoreLegal(db: Db): Promise<StoreLegal> {
  const parsed = storeLegalSchema.safeParse(await readSetting(db, 'store.legal'));
  return parsed.success ? parsed.data : EMPTY;
}
