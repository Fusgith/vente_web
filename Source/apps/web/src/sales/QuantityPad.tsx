import { formatMga, formatQty, splitInUnit, type ProductUnitHit } from '@vente-web/shared';
import { useState } from 'react';

import { labels } from '../labels.js';
import { buttonClass, tagClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { EraseKey, Key, Keypad } from '../ui/Keypad.js';
import type { DraftLine } from './draft.js';
import { entryToQuantity, nextEntry, type PadKey } from './pad-entry.js';

interface QuantityPadProps {
  line: DraftLine;
  position: number;
  onQty: (qty: string) => void;
  onUnit: (unitId: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

/**
 * Big-button pad of the line just added or tapped, in the tool pane (RG-DEV-06 §4): the quantity
 * shows selected, the first key replaces it; the sale unit is chosen by buttons, never a
 * drop-down, each with its price, its stock in that unit and its discount cap. « Valider » is the
 * tall key on the right, « Supprimer la ligne » far from it, bottom left.
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

  const output = invalid
    ? 'border-madder bg-madder-soft'
    : entry === null
      ? 'border-indigo bg-indigo-soft'
      : 'border-rule-strong bg-white';

  return (
    <section
      aria-label={pad.title(position)}
      className="@container flex shrink-0 flex-col overflow-hidden rounded-sheet border border-rule bg-white"
    >
      {/* Narrow (a phone), the article goes on its own line under « Ligne n » and « Fermer ». */}
      <header className="relative flex min-h-14 flex-wrap items-center gap-x-3 border-b border-rule bg-saffron-soft py-1 pr-1 pl-4">
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-saffron" />
        <h2 className="type-title shrink-0">{pad.title(position)}</h2>
        <p
          className="min-w-0 flex-1 truncate font-semibold @max-md:order-last @max-md:basis-full @max-md:pb-1"
          title={line.product.name}
        >
          <span className={`${tagClass} mr-1.5`}>{line.product.sku}</span>
          {line.product.name}
        </p>
        <button
          type="button"
          onClick={onClose}
          className={buttonClass('secondary', 'md', 'ml-auto shrink-0 px-3')}
        >
          <Icon name="close" className="size-5" />
          {pad.close}
        </button>
      </header>

      <div className="grid gap-3 p-3 @min-[30rem]:grid-cols-[minmax(0,1fr)_auto] @min-[30rem]:grid-rows-[auto_1fr]">
        <div className="flex min-w-0 flex-col gap-2">
          <div role="group" aria-label={pad.unit} className="flex flex-col gap-2">
            {line.product.units.map((unit) =>
              unit.price === null ? null : (
                <UnitChoice
                  key={unit.id}
                  unit={unit}
                  price={unit.price}
                  available={line.product.available}
                  chosen={unit.id === line.unit.id}
                  onChoose={() => onUnit(unit.id)}
                />
              ),
            )}
          </div>
          <div
            className={`flex min-h-16 items-center justify-between gap-2 rounded-control border px-3 ${output}`}
          >
            <span aria-hidden="true" className="text-14 leading-4 text-ink-2">
              {pad.quantity}
            </span>
            <output aria-label={pad.quantity} className="text-36 font-semibold figures">
              {entry === null ? formatQty(line.qty) : entry || '0'}
            </output>
          </div>
          {invalid && (
            <p role="alert" className="flex items-start gap-2 text-14 font-semibold text-madder">
              <Icon name="alert" className="size-5" />
              {pad.invalid}
            </p>
          )}
        </div>

        <div className="flex gap-2 @min-[30rem]:row-span-2">
          <Keypad
            size="lg"
            onDigit={press}
            left={
              <Key size="lg" onClick={() => press(',')}>
                ,
              </Key>
            }
            right={<EraseKey size="lg" label={pad.erase} onErase={() => press('erase')} />}
            className="flex-1 @min-[30rem]:w-49 @min-[30rem]:flex-none"
          />
          <button
            type="button"
            onClick={confirm}
            className={buttonClass('primary', 'lg', 'w-22 flex-col rounded-key px-1')}
          >
            <Icon name="check" />
            {pad.confirm}
          </button>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className={buttonClass('destructive', 'md', '@min-[30rem]:self-end')}
        >
          {pad.remove}
        </button>
      </div>
    </section>
  );
}

interface UnitChoiceProps {
  unit: ProductUnitHit;
  price: string;
  /** The article's stock in its base unit, told here in the unit of the button. */
  available: string;
  chosen: boolean;
  onChoose: () => void;
}

/** One sale unit: its label and price, then its stock in that unit and its discount cap. */
function UnitChoice({ unit, price, available, chosen, onChoose }: UnitChoiceProps) {
  const { count } = splitInUnit(available, unit.factor);
  const factor = formatQty(unit.factor);
  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={onChoose}
      className={`flex min-h-12 flex-col gap-0.5 rounded-control border px-3 py-1.5 text-left transition-colors duration-100 ${
        chosen
          ? 'border-indigo bg-indigo text-white active:bg-indigo-deep'
          : 'border-rule-strong bg-white text-ink active:bg-indigo-soft'
      }`}
    >
      <span className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate">
          <span className="font-bold">{unit.label}</span>
          {factor !== '1' && (
            <span className={chosen ? 'text-indigo-soft' : 'text-ink-2'}>
              {' '}
              {labels.sales.factor(factor)}
            </span>
          )}
        </span>
        {chosen && <Icon name="check" className="size-5 self-center" />}
      </span>
      <span className="text-right font-bold figures">{formatMga(price)}</span>
      <span
        className={`flex flex-wrap justify-between gap-x-2 text-14 leading-5 ${chosen ? 'text-indigo-soft' : 'text-ink-2'}`}
      >
        <span className="figures">{labels.sales.unitStock(formatQty(count))}</span>
        {unit.maxDiscountPct !== null && (
          <span className="figures">
            {labels.sales.maxDiscount(formatQty(unit.maxDiscountPct))}
          </span>
        )}
      </span>
    </button>
  );
}
