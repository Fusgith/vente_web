import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { keyClass, PHONE_DIGITS, type KeypadDigit, type KeySize } from './button.js';
import { Icon } from './Icon.js';

type KeyProps = ButtonHTMLAttributes<HTMLButtonElement> & { size?: KeySize | undefined };

/** A key of the pad for the caller's bottom row (`,` `0`…), same look as the digits. */
export function Key({ size = 'md', className = '', type = 'button', ...rest }: KeyProps) {
  return <button type={type} className={keyClass(size, className)} {...rest} />;
}

interface EraseKeyProps {
  /** Accessible name (e.g. « Effacer un chiffre »), or the visible text when `showLabel`. */
  label: string;
  showLabel?: boolean;
  onErase(): void;
  size?: KeySize;
  disabled?: boolean;
}

/** Backspace as an inline icon (the ⌫ glyph is not in the font subset). */
export function EraseKey({ label, showLabel = false, onErase, size, disabled }: EraseKeyProps) {
  return (
    <Key
      size={size}
      onClick={onErase}
      disabled={disabled}
      aria-label={showLabel ? undefined : label}
      className={showLabel ? 'text-18' : ''}
    >
      <Icon name="erase" className="size-7" />
      {showLabel && label}
    </Key>
  );
}

interface KeypadProps {
  onDigit(digit: KeypadDigit): void;
  /**
   * The bottom row, left to right, beside/around the 0 key: `left` and `right` are any keys
   * (e.g. `<Key>,</Key>` and `<EraseKey/>`), `null` leaves the cell empty.
   */
  left: ReactNode;
  right: ReactNode;
  size?: KeySize;
  disabled?: boolean;
  className?: string;
}

/**
 * The shared digit pad: 1 2 3 / 4 5 6 / 7 8 9 / left 0 right. Digit keys are plain buttons named
 * by their digit. The caller places anything beside it (a tall « Valider » key).
 */
export function Keypad({
  onDigit,
  left,
  right,
  size = 'md',
  disabled,
  className = '',
}: KeypadProps) {
  const digit = (value: KeypadDigit) => (
    <Key key={value} size={size} disabled={disabled} onClick={() => onDigit(value)}>
      {value}
    </Key>
  );
  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`}>
      {PHONE_DIGITS.map(digit)}
      {left ?? <span aria-hidden="true" />}
      {digit('0')}
      {right ?? <span aria-hidden="true" />}
    </div>
  );
}
