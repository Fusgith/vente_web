/**
 * An amount as typed at the register: spaces allowed — `\s` takes the no-break ones of RG-FMT-01
 * too — and a comma or a dot for decimals.
 */
const TYPED = /^\d{1,12}(?:\.\d{1,2})?$/;

/** `65 000,5` → `65000.5`, as the API reads it; null when it is not an amount. */
export function typedAmount(text: string): string | null {
  const clean = text.replace(/\s/g, '').replace(',', '.');
  return TYPED.test(clean) ? clean : null;
}
