import { formatQty, type QuoteLine } from '@vente-web/shared';
import { useState } from 'react';

import { labels } from '../labels.js';
import { entryToQuantity, nextEntry, type PadKey } from '../sales/pad-entry.js';
import { buttonClass, tagClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { EraseKey, Key, Keypad } from '../ui/Keypad.js';
import { Sheet } from '../ui/Sheet.js';

const text = labels.register;

interface LineAdjustSheetProps {
  line: QuoteLine;
  /** The last line cannot be removed: the order is cancelled instead. */
  lastLine: boolean;
  busy: boolean;
  onLower: (qty: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Lower than now, never zero: `qty` as typed is acceptable at the register (RG-CMD-05b). */
function lowerThan(entry: string | null, current: string): string | null {
  const qty = entry === null ? null : entryToQuantity(entry);
  return qty !== null && Number(qty) < Number(current) ? qty : null;
}

/**
 * One line of the order at the register (RG-CMD-05b): its quantity lowered on the pad, or the
 * line removed — never raised, an addition going through the salesperson.
 */
export function LineAdjustSheet({
  line,
  lastLine,
  busy,
  onLower,
  onRemove,
  onClose,
}: LineAdjustSheetProps) {
  const [entry, setEntry] = useState<string | null>(null);
  const press = (key: PadKey) => setEntry((current) => nextEntry(current, key));
  const lowered = lowerThan(entry, line.qty);
  const current = formatQty(line.qty);
  const refused = entry !== null && entry !== '' && lowered === null;

  return (
    <Sheet
      title={text.adjustTitle(line.position)}
      closeLabel={text.close}
      onClose={onClose}
      width="md"
      bodyClassName="flex flex-col gap-4"
    >
      <p className="leading-6">
        <span className={tagClass}>{line.sku}</span> {line.name}
      </p>
      <p className="text-ink-2">{text.currentQty(current, line.unitLabel)}</p>
      <label className="flex flex-col gap-1.5">
        <span className="font-semibold">{text.newQty}</span>
        <output
          aria-live="polite"
          className={`flex h-14 items-center justify-end rounded-control border px-4 text-24 font-semibold figures ${
            refused ? 'border-madder text-madder' : 'border-indigo'
          }`}
        >
          {entry ?? ''}
        </output>
      </label>
      <p className={`text-14 ${refused ? 'font-semibold text-madder' : 'text-ink-2'}`}>
        {text.lowerOnly(current, line.unitLabel)}
      </p>
      <div className="flex gap-2">
        <Keypad
          onDigit={press}
          left={<Key onClick={() => press(',')}>,</Key>}
          right={<EraseKey label={labels.sales.pad.erase} onErase={() => press('erase')} />}
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => lowered && onLower(lowered)}
          disabled={busy || lowered === null}
          className={buttonClass('primary', 'lg', 'w-24 flex-col rounded-key px-1')}
        >
          <Icon name="check" />
          {text.confirmQty}
        </button>
      </div>
      <div className="flex flex-col gap-1 border-t border-rule pt-3">
        <button
          type="button"
          onClick={onRemove}
          disabled={busy || lastLine}
          className={buttonClass('destructive', 'md', 'self-start')}
        >
          <Icon name="trash" className="size-5" />
          {text.removeLine}
        </button>
        {lastLine && <p className="text-14 text-ink-2">{text.lastLine}</p>}
      </div>
    </Sheet>
  );
}
