import { formatMga, formatQty, lineGross, sumAmounts } from '@vente-web/shared';
import { useEffect, useRef } from 'react';

import { labels } from '../labels.js';
import { sheetClass, tagClass } from '../ui/button.js';
import type { DraftLine } from './draft.js';

interface DraftTableProps {
  lines: readonly DraftLine[];
  selected: string | null;
  onSelect: (key: string) => void;
}

const CELL = 'px-2 first:pl-4 last:pr-4';
/** The header and the total stay in view while the lines scroll inside the sheet. */
const HEAD = `${CELL} sticky top-0 z-10 h-10 border-b border-rule bg-white text-14 font-semibold text-ink-2`;
const FOOT = `${CELL} sticky bottom-0 z-10 h-16 border-t-2 border-ink bg-white`;
/** Heights of the sticky head (h-10) and total (h-16): a row brought into view clears them. */
const HEAD_PX = 40;
const FOOT_PX = 64;
/**
 * On a phone the table scrolls sideways; the total must stay in view. The amount sticks to the
 * right edge on a clear ground (so it never hides « Total brut »), and the label, stuck to the
 * left, lays a white copy of itself one amount-cell further right to cover the lines beneath.
 */
const FOOT_LABEL_PHONE = 'max-md:left-0 max-md:shadow-[17rem_0_0_var(--color-white)]';
const FOOT_AMOUNT_PHONE = 'max-md:right-0 max-md:bg-transparent';

/**
 * The quote as a sheet of paper (RG-DEV-05): the lines as a table, the gross total pinned under
 * them. Discounts and the saved quote come with T-031 and T-030.
 */
export function DraftTable({ lines, selected, onSelect }: DraftTableProps) {
  const draft = labels.sales.draft;
  const amounts = lines.map((line) => lineGross(line.qty, line.unit.price));
  const selectedRow = useRef<HTMLTableRowElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scrolls the table only, never the page: on a phone the page holds the pad, which must stay
    // in view (scrollIntoView would scroll every ancestor).
    const box = scroller.current;
    const row = selectedRow.current;
    if (!box || !row) return;
    const boxRect = box.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const hiddenAbove = rowRect.top - (boxRect.top + HEAD_PX);
    const hiddenBelow = rowRect.bottom - (boxRect.bottom - FOOT_PX);
    if (hiddenAbove < 0) box.scrollTop += hiddenAbove;
    else if (hiddenBelow > 0) box.scrollTop += hiddenBelow;
  }, [selected]);

  return (
    <section
      aria-labelledby="draft-title"
      className={`${sheetClass} flex min-h-72 min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0`}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 pb-2">
        <h2 id="draft-title" className="type-title">
          {draft.title}
        </h2>
        <span className="rounded-full border border-dashed border-rule-strong px-2.5 text-14 leading-6 text-ink-2">
          {draft.unsaved}
        </span>
      </header>
      {lines.length === 0 ? (
        <p className="m-auto max-w-sm p-6 text-center text-ink-2">{draft.empty}</p>
      ) : (
        <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-160 table-fixed border-separate border-spacing-0 text-left text-16">
            <thead>
              <tr>
                <th className={`${HEAD} w-10`}>{draft.number}</th>
                <th className={HEAD}>{draft.designation}</th>
                <th className={`${HEAD} w-18 text-right`}>{draft.quantity}</th>
                <th className={`${HEAD} w-24`}>{draft.unit}</th>
                <th className={`${HEAD} w-32 text-right`}>{draft.unitPrice}</th>
                <th className={`${HEAD} w-35 text-right`}>{draft.amount}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const current = line.key === selected;
                const factor = formatQty(line.unit.factor);
                const row = `${CELL} h-14 border-b border-rule ${current ? 'bg-saffron-soft' : ''}`;
                // The line being edited: saffron ground and bar, edged in ink so it reads in daylight.
                const bar = current
                  ? 'shadow-[inset_2px_0_0_var(--color-ink),inset_6px_0_0_var(--color-saffron)]'
                  : '';
                return (
                  <tr
                    key={line.key}
                    ref={current ? selectedRow : undefined}
                    aria-current={current ? 'true' : undefined}
                  >
                    <td className={`${row} figures ${bar}`}>{index + 1}</td>
                    <td className={`${row} py-1`}>
                      <span className={tagClass}>{line.product.sku}</span>
                      <span className="block truncate leading-5" title={line.product.name}>
                        {line.product.name}
                      </span>
                    </td>
                    <td className={`${row} py-1 text-right`}>
                      <button
                        type="button"
                        onClick={() => onSelect(line.key)}
                        aria-label={draft.editQty(index + 1, formatQty(line.qty))}
                        className={`min-h-12 min-w-14 rounded-control border px-2.5 text-right text-18 font-semibold figures transition-colors duration-100 ${
                          current
                            ? 'border-indigo bg-indigo-soft'
                            : 'border-rule-strong bg-white active:bg-indigo-soft'
                        }`}
                      >
                        {formatQty(line.qty)}
                      </button>
                    </td>
                    <td className={`${row} truncate leading-5`}>
                      {line.unit.label}
                      {factor !== '1' && (
                        <>
                          {' '}
                          <span className="block text-14 text-ink-2">
                            {labels.sales.factorOf(factor, line.product.baseUnit)}
                          </span>
                        </>
                      )}
                    </td>
                    <td className={`${row} text-right figures`}>{formatMga(line.unit.price)}</td>
                    <td className={`${row} text-right font-semibold figures`}>
                      {formatMga(amounts[index] ?? '0')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th
                  scope="row"
                  colSpan={4}
                  className={`${FOOT} ${FOOT_LABEL_PHONE} text-left text-18 font-semibold`}
                >
                  {draft.grossTotal}
                </th>
                <td
                  colSpan={2}
                  className={`${FOOT} ${FOOT_AMOUNT_PHONE} text-right text-24 font-bold figures`}
                >
                  {formatMga(sumAmounts(amounts))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
