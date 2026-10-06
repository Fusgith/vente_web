/**
 * Class-name helpers for the few kinds of buttons of the identity (not a kit): every one is at
 * least 48 px tall, has a pressed state and the focus ring (from the base layer or a variant).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'band' | 'link';
export type ButtonSize = 'md' | 'lg';

const BASE =
  'inline-flex select-none items-center justify-center gap-2 font-semibold transition-colors duration-100';

const SIZE: Record<ButtonSize, string> = {
  md: 'min-h-12 px-4 text-16',
  lg: 'min-h-14 px-5 text-18',
};

/** Disabled looks « not available », not faded: cotton ground, dashed border, ink-2 text. */
const DISABLED =
  'disabled:border-dashed disabled:border-rule-strong disabled:bg-cotton disabled:font-medium disabled:text-ink-2';

const VARIANT: Record<ButtonVariant, string> = {
  primary: `rounded-control border border-indigo bg-indigo font-bold text-white active:border-indigo-deep active:bg-indigo-deep ${DISABLED}`,
  secondary: `rounded-control border border-rule-strong bg-white text-ink active:bg-indigo-soft ${DISABLED}`,
  destructive: `rounded-control border border-madder bg-madder-soft text-madder active:bg-madder active:text-white ${DISABLED}`,
  // On the coloured top band: a darker fill of the band colour, flush, saffron focus ring.
  band: 'focus-frame bg-frame-deep text-white active:bg-frame-press disabled:opacity-70',
  link: 'rounded-tag px-1 text-ink underline decoration-2 underline-offset-4 active:bg-indigo-soft',
};

export function buttonClass(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  extra = '',
): string {
  return `${BASE} ${SIZE[size]} ${VARIANT[variant]} ${extra}`.trim();
}

/** A white sheet on the cotton field (the quote, the login panel, a placeholder workspace). */
export const sheetClass = 'rounded-sheet border border-rule bg-white';

/** A product code (SAV-001): a small tag, Asap 600 with tabular figures, never monospace. */
export const tagClass =
  'inline-block rounded-tag border border-rule-strong bg-white px-1.5 text-14 leading-[18px] font-semibold text-ink-2 figures';

export type KeySize = 'md' | 'lg';

const KEY_HEIGHT: Record<KeySize, string> = { md: 'min-h-14', lg: 'min-h-16' };

/** A key of a digit pad: radius 12, rule-strong border, Asap 24/600 tabular digits, indigo-soft pressed. */
export function keyClass(size: KeySize = 'md', extra = ''): string {
  // Two text sizes in one class list do not cascade by order: a size in `extra` replaces the 24.
  const text = /(^|\s)text-(14|16|18|21|24|36)(\s|$)/.test(extra) ? '' : 'text-24';
  return `${KEY_HEIGHT[size]} flex select-none items-center justify-center gap-2 rounded-key border border-rule-strong bg-white ${text} font-semibold text-ink figures transition-colors duration-100 active:bg-indigo-soft disabled:border-dashed disabled:bg-cotton disabled:text-ink-2 ${extra}`.trim();
}

/** Phone order, as on every mobile money keypad: 1 2 3 on top (the pad adds 0 below 8). */
export const PHONE_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
export type KeypadDigit = (typeof PHONE_DIGITS)[number] | '0';
