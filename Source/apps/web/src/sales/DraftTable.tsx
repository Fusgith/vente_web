import { computeQuote, formatMga, formatQty } from '@vente-web/shared';
import { useEffect, useRef } from 'react';

import { labels } from '../labels.js';
import { apiRequest } from '../api/client.js';
import { sheetClass, tagClass } from '../ui/button.js';
import type { DraftState } from './draft.js';

interface DraftTableProps {
  draft: DraftState;
  onSelect: (key: string) => void;
}

const CELL = 'px-2 first:pl-4 last:pr-4';
const HEAD = CELL + ' sticky top-0 z-10 h-10 border-b border-rule bg-white text-14 font-semibold text-ink-2';
const FOOT = CELL + ' sticky bottom-0 z-10 h-14 border-t-2 border-rule bg-white';
const FOOT_STRONG = CELL + ' sticky bottom-0 z-10 h-16 border-t-2 border-ink bg-white';

const HEAD_PX = 40;
const FOOT_PX = 64;
const FOOT_LABEL_PHONE = 'max-md:left-0 max-md:shadow-[17rem_0_0_var(--color-white)]';
const FOOT_AMOUNT_PHONE = 'max-md:right-0 max-md:bg-transparent';

export function DraftTable({ draft: { lines, selected, orderDiscount, orderGranted }, onSelect }: DraftTableProps) {
  const draftL = labels.sales.draft;
  
  const quote = computeQuote({
    lines: lines.map(l => ({
      quantity: l.qty,
      unitPrice: l.unit.price,
      capPct: l.capPct,
      discount: l.discount,
      granted: l.granted ?? null,
    })),
    orderDiscount,
    orderGranted: orderGranted ?? null,
  });

  const selectedRow = useRef<HTMLTableRowElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
    <section aria-labelledby="draft-title" className={sheetClass + " flex min-h-72 min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0"}>
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 pb-2">
        <h2 id="draft-title" className="type-title">{draftL.title}</h2>
        <span className="rounded-full border border-dashed border-rule-strong px-2.5 text-14 leading-6 text-ink-2">
          {draftL.unsaved}
        </span>
      </header>
      {lines.length === 0 ? (
        <p className="m-auto max-w-sm p-6 text-center text-ink-2">{draftL.empty}</p>
      ) : (
        <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[50rem] table-fixed border-separate border-spacing-0 text-left text-16">
            <thead>
              <tr>
                <th className={HEAD + " w-10"}>{draftL.number}</th>
                <th className={HEAD}>{draftL.designation}</th>
                <th className={HEAD + " w-18 text-right"}>{draftL.quantity}</th>
                <th className={HEAD + " w-20"}>{draftL.unit}</th>
                <th className={HEAD + " w-28 text-right"}>{draftL.unitPrice}</th>
                <th className={HEAD + " w-28 text-right"}>{draftL.discount}</th>
                <th className={HEAD + " w-32 text-right"}>{draftL.netAmount}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const current = line.key === selected;
                const factor = formatQty(line.unit.factor);
                const row = CELL + " h-14 border-b border-rule " + (current ? "bg-saffron-soft" : "");
                const bar = current ? "shadow-[inset_2px_0_0_var(--color-ink),inset_6px_0_0_var(--color-saffron)]" : "";
                const qtLine = quote.lines[index]!;
                return (
                  <tr key={line.key} ref={current ? selectedRow : undefined} aria-current={current ? "true" : undefined}>
                    <td className={row + " figures " + bar}>{index + 1}</td>
                    <td className={row + " py-1"}>
                      <span className={tagClass}>{line.product.sku}</span>
                      <span className="block truncate leading-5" title={line.product.name}>{line.product.name}</span>
                    </td>
                    <td className={row + " py-1 text-right"}>
                      <button
                        type="button"
                        onClick={() => onSelect(line.key)}
                        aria-label={draftL.editQty(index + 1, formatQty(line.qty))}
                        className={"min-h-12 min-w-14 rounded-control border px-2.5 text-right text-18 font-semibold figures transition-colors duration-100 " + (current ? "border-indigo bg-indigo-soft" : "border-rule-strong bg-white active:bg-indigo-soft")}
                      >
                        {formatQty(line.qty)}
                      </button>
                    </td>
                    <td className={row + " truncate leading-5"}>
                      {line.unit.label}
                      {factor !== '1' && (
                        <>
                          {' '}
                          <span className="block text-14 text-ink-2">{labels.sales.factorOf(factor, line.product.baseUnit)}</span>
                        </>
                      )}
                    </td>
                    <td className={row + " text-right figures"}>{formatMga(line.unit.price)}</td>
                    <td className={row + " text-right figures text-14"}>
                      {qtLine.discount !== '0.00' && (
                        <>
                          <div className="text-saffron-strong font-semibold">{draftL.discountVal(formatMga(qtLine.discount))}</div>
                          <div className="text-ink-2">{qtLine.discountPct} %</div>
                        </>
                      )}
                    </td>
                    <td className={row + " text-right font-semibold figures"}>
                      {formatMga(qtLine.net)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {quote.discountTotal !== '0.00' && (
                <>
                  <tr>
                    <th scope="row" colSpan={5} className={FOOT + " " + FOOT_LABEL_PHONE + " text-right font-medium text-ink-2"}>{draftL.grossTotal}</th>
                    <td colSpan={2} className={FOOT + " " + FOOT_AMOUNT_PHONE + " text-right figures text-ink-2"}>{formatMga(quote.grossTotal)}</td>
                  </tr>
                  <tr>
                    <th scope="row" colSpan={5} className={FOOT + " " + FOOT_LABEL_PHONE + " text-right font-medium text-saffron-strong"}>{draftL.discountTotal}</th>
                    <td colSpan={2} className={FOOT + " " + FOOT_AMOUNT_PHONE + " text-right figures text-saffron-strong"}>{draftL.discountVal(formatMga(quote.discountTotal))}</td>
                  </tr>
                </>
              )}
              <tr>
                <th scope="row" colSpan={5} className={FOOT_STRONG + " " + FOOT_LABEL_PHONE + " text-left text-18 font-semibold"}>{draftL.total}</th>
                <td colSpan={2} className={FOOT_STRONG + " " + FOOT_AMOUNT_PHONE + " text-right text-24 font-bold figures"}>
                  {formatMga(quote.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}


