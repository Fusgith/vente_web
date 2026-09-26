import { fittingQuantity, formatQty, type StockShortage } from '@vente-web/shared';

import { labels } from '../labels.js';
import { buttonClass, tagClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { Sheet } from '../ui/Sheet.js';
import type { DraftLine } from './draft.js';

const text = labels.sales.stock;

interface StockShortageSheetProps {
  lines: DraftLine[];
  shortages: StockShortage[];
  onFit: (key: string, qty: string) => void;
  onRemove: (key: string) => void;
  onClose: () => void;
}

/** What the one line of a short product can be brought to, or its removal when nothing fits. */
function Proposal({
  line,
  position,
  available,
  onFit,
  onRemove,
}: {
  line: DraftLine;
  position: number;
  available: string;
  onFit: (key: string, qty: string) => void;
  onRemove: (key: string) => void;
}) {
  const fitting = fittingQuantity(available, line.unit.factor);
  if (fitting === '0') {
    return (
      <button
        type="button"
        onClick={() => onRemove(line.key)}
        className={buttonClass('destructive', 'md', 'self-start')}
      >
        <Icon name="trash" className="size-5" />
        {text.drop(position)}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onFit(line.key, fitting)}
      className={buttonClass('secondary', 'md', 'self-start')}
    >
      {text.fit(position, formatQty(fitting), line.unit.label)}
    </button>
  );
}

/**
 * Validation refused for want of stock (RG-CMD-02): each product short, with what is available
 * and what the lines ask, in base unit. A product on one line is offered the largest quantity
 * the stock covers; on several lines, the salesperson chooses which to reduce.
 */
export function StockShortageSheet({
  lines,
  shortages,
  onFit,
  onRemove,
  onClose,
}: StockShortageSheetProps) {
  return (
    <Sheet
      title={text.title}
      closeLabel={text.close}
      onClose={onClose}
      width="md"
      bodyClassName="flex flex-col gap-4"
    >
      <p className="text-ink-2">{text.hint}</p>
      <ul className="flex flex-col gap-3">
        {shortages.map((shortage) => {
          const own = lines.flatMap((line, index) =>
            line.product.id === shortage.productId ? [{ line, position: index + 1 }] : [],
          );
          const positions = own.map((entry) => entry.position);
          return (
            <li
              key={shortage.productId}
              className="flex flex-col gap-2 rounded-control border border-madder bg-madder-soft p-3"
            >
              <p className="leading-6">
                <span className={tagClass}>{shortage.sku}</span> {shortage.name}
              </p>
              <p className="font-semibold text-madder figures">
                {text.counts(
                  formatQty(shortage.available),
                  formatQty(shortage.requested),
                  shortage.baseUnit,
                )}
                {' — '}
                {positions.length === 1
                  ? text.line(positions[0]!)
                  : text.lines(positions.join(', '))}
              </p>
              {own.length === 1 && (
                <Proposal
                  line={own[0]!.line}
                  position={own[0]!.position}
                  available={shortage.available}
                  onFit={onFit}
                  onRemove={onRemove}
                />
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
