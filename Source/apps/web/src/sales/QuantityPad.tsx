import { formatMga, formatQty } from '@vente-web/shared';
import { useState } from 'react';

import { labels } from '../labels.js';
import type { DraftLine } from './draft.js';
import { entryToQuantity, nextEntry, PAD_DIGITS, type PadKey } from './pad-entry.js';

interface QuantityPadProps {
  line: DraftLine;
  position: number;
  onQty: (qty: string) => void;
  onUnit: (unitId: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

const KEY_CLASS =
  'min-h-14 rounded-xl bg-slate-100 text-2xl font-semibold text-slate-900 active:bg-slate-300';

/**
 * Big-button pad opened on the line just added or tapped (RG-DEV-06 §4): the quantity shows
 * selected, the first key replaces it; the sale unit is chosen by buttons, never a drop-down.
 */
export function QuantityPad({
  line,
  position,
  onQty,
  onUnit,
  onRemove,
  onClose,
}: QuantityPadProps) {
  const [entry, setEntry] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const pad = labels.sales.pad;

  const press = (key: PadKey) => {
    setInvalid(false);
    setEntry((current) => nextEntry(current, key));
  };

  const confirm = () => {
    if (entry === null) return onClose();
    const qty = entryToQuantity(entry);
    if (qty === null) return setInvalid(true);
    onQty(qty);
    onClose();
  };

  return (
    <section
      aria-label={pad.title(position)}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white p-4 shadow-2xl"
    >
      <div className="mx-auto flex max-w-md flex-col gap-3">
        <div className="flex items-start gap-2">
          <p className="flex-1">
            <span className="font-semibold">{pad.title(position)}</span> · {line.product.sku}{' '}
            {line.product.name}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg px-3 font-medium text-slate-700 hover:bg-slate-100"
          >
            {pad.close}
          </button>
        </div>

        <div role="group" aria-label={pad.unit} className="flex flex-wrap gap-2">
          {line.product.units.map((unit) =>
            unit.price === null ? null : (
              <button
                key={unit.id}
                type="button"
                aria-pressed={unit.id === line.unit.id}
                onClick={() => onUnit(unit.id)}
                className="min-h-11 rounded-lg border border-teal-700 px-3 aria-pressed:bg-teal-700 aria-pressed:text-white"
              >
                {unit.label} · {formatMga(unit.price)}
              </button>
            ),
          )}
        </div>

        <output
          aria-label={pad.quantity}
          className={`rounded-xl px-4 py-2 text-right text-3xl font-bold ${
            entry === null ? 'bg-teal-100 text-teal-900' : 'bg-slate-50'
          } ${invalid ? 'ring-2 ring-red-600' : ''}`}
        >
          {entry === null ? formatQty(line.qty) : entry || '0'}
        </output>
        {invalid && (
          <p role="alert" className="text-red-700">
            {pad.invalid}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2">
          {PAD_DIGITS.map((digit) => (
            <button key={digit} type="button" onClick={() => press(digit)} className={KEY_CLASS}>
              {digit}
            </button>
          ))}
          <button type="button" onClick={() => press(',')} className={KEY_CLASS}>
            ,
          </button>
          <button type="button" onClick={() => press('0')} className={KEY_CLASS}>
            0
          </button>
          <button
            type="button"
            onClick={() => press('erase')}
            aria-label={pad.erase}
            className={KEY_CLASS}
          >
            ⌫
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onRemove}
            className="min-h-14 rounded-xl border-2 border-red-700 font-semibold text-red-700"
          >
            {pad.remove}
          </button>
          <button
            type="button"
            onClick={confirm}
            className="min-h-14 rounded-xl bg-teal-700 text-xl font-bold text-white hover:bg-teal-800"
          >
            {pad.confirm}
          </button>
        </div>
      </div>
    </section>
  );
}
