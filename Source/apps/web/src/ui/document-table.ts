/** A cell of a quote, order or invoice table (RG-DEV-05). */
export const CELL = 'px-2 first:pl-4 last:pr-4';
/** Its column header, kept in view while the lines scroll. */
export const HEAD = `${CELL} sticky top-0 z-10 h-12 border-b border-rule bg-white pb-1 align-bottom text-14 leading-5 font-semibold text-ink-2`;

export const isZero = (amount: string) => amount === '0.00';
