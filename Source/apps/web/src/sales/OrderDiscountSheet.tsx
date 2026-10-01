import { computeQuote, formatMga, type DiscountEntry } from '@vente-web/shared';

import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { EraseKey, Key, Keypad } from '../ui/Keypad.js';
import { Sheet } from '../ui/Sheet.js';
import { quoteInput } from './discount-entry.js';
import { DiscountEntryField, FieldMessage, KindToggle } from './DiscountInput.js';
import type { DraftState } from './draft.js';
import { useDiscountTyping } from './useDiscountTyping.js';

const text = labels.sales.discount;

interface OrderDiscountSheetProps {
  draft: DraftState;
  onApply: (discount: DiscountEntry | null) => void;
  onClose: () => void;
}

/**
 * The discount on the total (RG-REM-06), on the subtotal, in % or in MGA. Without a code it is
 * bounded by the headroom the lines leave under their caps (H23) — or, the owner's code covering
 * the total, by what it grants (H42) — shown in MGA before anything is typed (RG-REM-02); the
 * amount due follows each key.
 */
export function OrderDiscountSheet({ draft, onApply, onClose }: OrderDiscountSheetProps) {
  const measure = (orderDiscount: DiscountEntry | null) =>
    computeQuote(quoteInput({ ...draft, orderDiscount }));
  const typing = useDiscountTyping(
    draft.orderDiscount,
    (candidate) => measure(candidate).orderWithinLimit,
  );
  const quote = measure(typing.value);
  const closed = quote.maxOrderDiscount === '0.00';
  const locked = closed && typing.value === null;
  const max = formatMga(quote.maxOrderDiscount);

  const apply = () => {
    if (!quote.orderWithinLimit) return typing.refuse();
    onApply(typing.value);
    onClose();
  };

  return (
    <Sheet
      title={text.order}
      closeLabel={text.close}
      onClose={onClose}
      width="md"
      bodyClassName="flex flex-col gap-4"
    >
      <div className="flex min-w-0 flex-col gap-3">
        <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-4">
          <dt className="text-ink-2">{text.subtotal}</dt>
          <dd className="text-right figures">{formatMga(quote.subtotal)}</dd>
          <dt className="font-semibold">{labels.sales.draft.total}</dt>
          <dd className="text-right text-18 font-bold figures">{formatMga(quote.total)}</dd>
        </dl>
        <div className="grid grid-cols-[minmax(0,1fr)_9rem] items-start gap-2">
          <DiscountEntryField
            typing={typing}
            active
            onActivate={() => undefined}
            disabled={locked}
          />
          <KindToggle typing={typing} onActivate={() => undefined} disabled={locked} />
        </div>
        <FieldMessage
          hint={
            draft.orderGranted
              ? text.maxGranted(max)
              : closed
                ? draft.code
                  ? text.noOrderRoomCoded
                  : text.noOrderRoom
                : text.maxOrder(max)
          }
          alert={
            typing.refused
              ? draft.orderGranted
                ? text.beyondGranted(max)
                : draft.code
                  ? text.beyondOrderCoded(max)
                  : text.beyondOrder(max)
              : null
          }
        />
        {draft.orderDiscount && (
          <button
            type="button"
            onClick={() => {
              onApply(null);
              onClose();
            }}
            className={buttonClass('destructive', 'md', 'mt-auto')}
          >
            {text.remove}
          </button>
        )}
      </div>
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
          className={buttonClass('primary', 'lg', 'w-22 flex-col rounded-key px-1')}
        >
          <Icon name="check" />
          {text.apply}
        </button>
      </div>
    </Sheet>
  );
}
