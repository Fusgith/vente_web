import { isCapRate, type DiscountEntry } from '@vente-web/shared';

const AMOUNT = /^\d{1,12}(?:\.\d{1,2})?$/;

/** A discount being typed for the owner: its kind, and the value as typed (« 5 000 », « 7,5 »). */
export interface Grant {
  kind: DiscountEntry['kind'];
  value: string;
}

/** « 5 000 » → « 5000 », « 7,5 » → « 7.5 ». */
export const entryOf = ({ kind, value }: Grant): DiscountEntry => ({
  kind,
  value: value.replace(/\s/g, '').replace(',', '.'),
});

/** A discount shown again for typing: « 7.5 » → « 7,5 ». */
export const grantOf = ({ kind, value }: DiscountEntry): Grant => ({
  kind,
  value: value.replace('.', ','),
});

/** Above 0; a rate up to 100 %, an amount in MGA with 2 decimals at most (H41). */
export function isGrant(grant: Grant): boolean {
  const { kind, value } = entryOf(grant);
  return /[1-9]/.test(value) && (kind === 'pct' ? isCapRate(value) : AMOUNT.test(value));
}
