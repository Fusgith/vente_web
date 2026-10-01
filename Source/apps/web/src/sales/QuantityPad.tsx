import {
  formatMga,
  formatQty,
  splitInUnit,
  type DiscountEntry,
  type ProductUnitHit,
} from '@vente-web/shared';
import { useState } from 'react';

import { labels } from '../labels.js';
import { buttonClass, tagClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { EraseKey, Key, Keypad } from '../ui/Keypad.js';
import { measureLine } from './discount-entry.js';
import { DiscountEntryField, EntryField, FieldMessage, KindToggle } from './DiscountInput.js';
import { followsGrant, grantedDiscount, type DraftLine } from './draft.js';
import { entryToQuantity, nextEntry, type PadKey } from './pad-entry.js';
import { useDiscountTyping } from './useDiscountTyping.js';

interface QuantityPadProps {
  line: DraftLine;
  position: number;
  /** « Valider »: the quantity and the discount typed, the discount within the cap. */
  onConfirm: (qty: string, discount: DiscountEntry | null) => void;
  onUnit: (unitId: string) => void;
  onRemove: () => void;
  onClose: () => void;
  /** What the owner's code grants the line at the quantity typed: its share follows it (H41). */
  grantAt?: (qty: string) => DiscountEntry | null;
  /** A code is on the quote: a line it does not cover says so, rather than asking for one. */
  coded?: boolean;
}

/**
 * Big-button pad of the line just added or tapped, in the tool pane (RG-DEV-06 §4): the quantity
 * shows selected, the first key replaces it; the sale unit is chosen by buttons, never a
 * drop-down, each with its price and its stock in that unit. The discount is typed on the same
 * keys, in % or in MGA, its maximum shown and never passed (RG-REM-02/06). Everything fits the
 * tool pane of the tablet held landscape (1280 × 800). « Valider » is the tall key on the right,
 * « Supprimer la ligne » far from it, in the header.
 */
export function QuantityPad({
  line,
  position,
  onConfirm,
  onUnit,
  onRemove,
  onClose,
  grantAt,
  coded = false,
}: QuantityPadProps) {
  const [entry, setEntry] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [field, setField] = useState<'qty' | 'discount'>('qty');
  const pad = labels.sales.pad;
  const text = labels.sales.discount;

  // The cap applies to the gross of the quantity being typed (RG-REM-06).
  const pendingQty = (entry === null ? line.qty : entryToQuantity(entry)) ?? line.qty;
  // The owner's code covers the line: what it grants at that quantity replaces the cap (H42), and
  // a discount still at its share follows it.
  const granted = grantAt ? grantAt(pendingQty) : (line.granted ?? null);
  const sized = { ...line, granted };
  const current =
    granted && followsGrant(line)
      ? grantedDiscount(granted, pendingQty, line.unit.price)
      : line.discount;
  const discount = useDiscountTyping(
    current,
    (candidate) => measureLine(sized, pendingQty, candidate).withinLimit,
  );
  const measured = measureLine(sized, pendingQty, discount.value);
  const closed = measured.maxDiscount === '0.00';
  const max = [formatQty(line.capPct), formatMga(measured.maxDiscount)] as const;
  const hint = granted
    ? text.maxGranted(max[1])
    : closed
      ? coded
        ? text.noLineDiscountCoded
        : text.noLineDiscount
      : text.maxLine(...max);
  const beyond = granted
    ? text.beyondGranted(max[1])
    : coded
      ? text.beyondLineCoded(...max)
      : text.beyondLine(...max);

  const press = (key: PadKey) => {
    if (field === 'discount') return discount.press(key);
    setInvalid(false);
    setEntry((current) => nextEntry(current, key));
  };

  const confirm = () => {
    const qty = entry === null ? line.qty : entryToQuantity(entry);
    if (qty === null) {
      setField('qty');
      return setInvalid(true);
    }
    // Fewer items, a smaller maximum: an amount typed before may no longer fit.
    if (!measureLine(sized, qty, discount.value).withinLimit) {
      setField('discount');
      return discount.refuse();
    }
    onConfirm(qty, discount.value);
    onClose();
  };

  return (
    <section
      aria-label={pad.title(position)}
      className="@container flex shrink-0 flex-col overflow-hidden rounded-sheet border border-rule bg-white"
    >
      {/* Narrow (a phone), the article goes on its own line under « Ligne n » and « Fermer ». */}
      <header className="relative flex min-h-14 flex-wrap items-center gap-x-2 border-b border-rule bg-saffron-soft py-1 pr-1 pl-4">
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
          onClick={onRemove}
          aria-label={pad.remove}
          title={pad.remove}
          className={buttonClass('destructive', 'md', 'ml-auto shrink-0 px-3')}
        >
          <Icon name="trash" className="size-5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className={buttonClass('secondary', 'md', 'shrink-0 px-3')}
        >
          <Icon name="close" className="size-5" />
          {pad.close}
        </button>
      </header>

      <div className="grid gap-3 p-3 @min-[40rem]:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-2">
          <div
            role="group"
            aria-label={pad.unit}
            className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-2"
          >
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
          <div className="grid grid-cols-2 items-start gap-2">
            <EntryField
              label={pad.quantity}
              value={entry === null ? formatQty(line.qty) : entry || '0'}
              look={
                invalid
                  ? 'wrong'
                  : field !== 'qty'
                    ? 'idle'
                    : entry === null
                      ? 'selected'
                      : 'active'
              }
              onActivate={() => setField('qty')}
            />
            <DiscountEntryField
              typing={discount}
              active={field === 'discount'}
              onActivate={() => setField('discount')}
              disabled={closed && discount.value === null}
            />
            <FieldMessage
              hint={hint}
              alert={invalid ? pad.invalid : discount.refused ? beyond : null}
            />
            <KindToggle
              typing={discount}
              onActivate={() => setField('discount')}
              disabled={closed && discount.value === null}
            />
          </div>
        </div>

        <div className="flex gap-2 @min-[40rem]:self-start">
          <Keypad
            onDigit={press}
            left={<Key onClick={() => press(',')}>,</Key>}
            right={<EraseKey label={pad.erase} onErase={() => press('erase')} />}
            className="flex-1 @min-[40rem]:w-49 @min-[40rem]:flex-none"
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

/** One sale unit: its label, then its price and its stock in that unit. */
function UnitChoice({ unit, price, available, chosen, onChoose }: UnitChoiceProps) {
  const { count } = splitInUnit(available, unit.factor);
  const factor = formatQty(unit.factor);
  const muted = chosen ? 'text-indigo-soft' : 'text-ink-2';
  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={onChoose}
      className={`flex min-h-14 min-w-0 flex-col justify-center rounded-control border px-3 py-1 text-left transition-colors duration-100 ${
        chosen
          ? 'border-indigo bg-indigo text-white active:bg-indigo-deep'
          : 'border-rule-strong bg-white text-ink active:bg-indigo-soft'
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate">
          <span className="font-bold">{unit.label}</span>
          {factor !== '1' && <span className={muted}> {labels.sales.factor(factor)}</span>}
        </span>
        {chosen && <Icon name="check" className="size-5 shrink-0" />}
      </span>
      <span className="flex flex-wrap justify-between gap-x-2 text-14 leading-5">
        <span className="font-semibold figures">{formatMga(price)}</span>
        <span className={`${muted} figures`}>{labels.sales.unitStock(formatQty(count))}</span>
      </span>
    </button>
  );
}
