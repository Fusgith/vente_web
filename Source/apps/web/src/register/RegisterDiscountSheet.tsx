import { formatMga, formatQty, type DiscountEntry, type Order } from '@vente-web/shared';

import { labels } from '../labels.js';
import { typedDiscount } from '../sales/draft-load.js';
import { DiscountEntryField, FieldMessage, KindToggle } from '../sales/DiscountInput.js';
import { useDiscountTyping } from '../sales/useDiscountTyping.js';
import { buttonClass, tagClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { EraseKey, Key, Keypad } from '../ui/Keypad.js';
import { Sheet } from '../ui/Sheet.js';
import { discountedTotals, typedTotal } from './order-discounts.js';

const text = labels.register;

interface RegisterDiscountSheetProps {
  order: Order;
  /** The line by its position, or null for the discount on the total. */
  position: number | null;
  /** The suggested discount of each line, in the order of the lines (H62). */
  suggested: readonly (string | null)[];
  busy: boolean;
  onApply: (discount: DiscountEntry | null) => void;
  onClose: () => void;
}

/**
 * A discount the cashier applies at the customer's request, on a line or on the total, in % or in
 * MGA (H61, RG-REM-06): its maximum shown before anything is typed (RG-REM-02) — the cap, the
 * line's suggested discount when larger (H62), or what the owner granted —, a key beyond refused;
 * beyond, the owner is asked (RG-REM-03).
 */
export function RegisterDiscountSheet({
  order,
  position,
  suggested,
  busy,
  onApply,
  onClose,
}: RegisterDiscountSheetProps) {
  const index = order.lines.findIndex((candidate) => candidate.position === position);
  const line = order.lines[index] ?? null;
  const current = line
    ? typedDiscount(line.discountPct, line.discountAmount, line.gross)
    : typedTotal(order);
  const measure = (discount: DiscountEntry | null) => {
    const totals = discountedTotals(order, line ? line.position : null, discount, suggested);
    const at = line ? totals.lines[index] : null;
    return {
      totals,
      within: at ? at.withinLimit : totals.orderWithinLimit,
      max: at ? at.maxDiscount : totals.maxOrderDiscount,
    };
  };
  const typing = useDiscountTyping(current, (candidate) => measure(candidate).within);
  const { totals, within, max } = measure(typing.value);
  const locked = max === '0.00' && current === null;
  const shown = formatMga(max);
  // What the owner granted replaces the cap (RG-REM-04): on this line, or on the total.
  const granted = line
    ? line.discountSource === 'CODE'
    : (order.discountCode?.items.some((item) => item.productId === null) ?? false);
  // The line's suggested discount, shown when it goes beyond the cap (H62).
  const ruled = line ? (suggested[index] ?? null) : null;
  // Rates of 2 decimals at most 100: exact as numbers, for a hint the API checks anyway.
  const byRule = !!line && !!ruled && Number(ruled) > Number(line.capPct);

  const apply = () => {
    if (!within) return typing.refuse();
    if (typing.untouched) return onClose();
    onApply(typing.value);
  };

  return (
    <Sheet
      title={line ? text.lineDiscount(line.position) : text.totalDiscount}
      closeLabel={text.close}
      onClose={onClose}
      width="md"
      bodyClassName="flex flex-col gap-4"
    >
      {line && (
        <p className="leading-6">
          <span className={tagClass}>{line.sku}</span> {line.name}
        </p>
      )}
      <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-4">
        <dt className="text-ink-2">{line ? text.lineGross : labels.sales.discount.subtotal}</dt>
        <dd className="text-right figures">{formatMga(line ? line.gross : totals.subtotal)}</dd>
        <dt className="font-semibold">{text.discountTotalAfter}</dt>
        <dd className="text-right text-18 font-bold figures">{formatMga(totals.total)}</dd>
      </dl>
      <div className="grid grid-cols-[minmax(0,1fr)_9rem] items-start gap-2">
        <DiscountEntryField typing={typing} active onActivate={() => undefined} disabled={locked} />
        <KindToggle typing={typing} onActivate={() => undefined} disabled={locked} />
      </div>
      <FieldMessage
        hint={
          locked
            ? text.discountNoRoom
            : granted
              ? text.discountMaxGranted(shown)
              : byRule && ruled
                ? text.discountMaxRule(formatQty(ruled), shown)
                : line
                  ? text.discountMaxCap(formatQty(line.capPct), shown)
                  : text.discountMax(shown)
        }
        alert={typing.refused ? text.discountBeyond(shown) : null}
      />
      <div className="flex gap-2">
        <Keypad
          size="lg"
          onDigit={typing.press}
          disabled={locked}
          left={
            <Key size="lg" disabled={locked} onClick={() => typing.press(',')}>
              ,
            </Key>
          }
          right={
            <EraseKey
              size="lg"
              label={labels.sales.pad.erase}
              disabled={locked}
              onErase={() => typing.press('erase')}
            />
          }
          className="flex-1"
        />
        <button
          type="button"
          onClick={apply}
          disabled={busy || locked}
          className={buttonClass('primary', 'lg', 'w-22 flex-col rounded-key px-1')}
        >
          <Icon name="check" />
          {text.applyDiscount}
        </button>
      </div>
      {current && (
        <button
          type="button"
          onClick={() => onApply(null)}
          disabled={busy}
          className={buttonClass('destructive', 'md', 'self-start')}
        >
          {text.removeDiscount}
        </button>
      )}
    </Sheet>
  );
}
