import { formatMga, formatQty, lineGross, sumAmounts } from '@vente-web/shared';

import { labels } from '../labels.js';
import type { DraftLine } from './draft.js';

interface DraftTableProps {
  lines: readonly DraftLine[];
  selected: string | null;
  onSelect: (key: string) => void;
}

const CELL = 'px-2 py-2';

/**
 * The lines picked so far, as a table (RG-DEV-05). Discounts and totals below the gross total
 * come with the discount engine (T-031) and the saved quote (T-030).
 */
export function DraftTable({ lines, selected, onSelect }: DraftTableProps) {
  const draft = labels.sales.draft;
  const amounts = lines.map((line) => lineGross(line.qty, line.unit.price));

  return (
    <section aria-labelledby="draft-title" className="flex flex-col gap-2">
      <h2 id="draft-title" className="text-lg font-bold text-slate-900">
        {draft.title}
      </h2>
      <p className="text-sm text-slate-600">{draft.unsaved}</p>
      {lines.length === 0 ? (
        <p className="rounded-lg bg-white p-4 text-slate-600 ring-1 ring-slate-200">
          {draft.empty}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
          <table className="w-full text-left">
            <thead className="border-b border-slate-200 text-sm text-slate-600">
              <tr>
                <th className={CELL}>{draft.number}</th>
                <th className={CELL}>{draft.designation}</th>
                <th className={`${CELL} text-right`}>{draft.quantity}</th>
                <th className={CELL}>{draft.unit}</th>
                <th className={`${CELL} text-right`}>{draft.unitPrice}</th>
                <th className={`${CELL} text-right`}>{draft.amount}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr
                  key={line.key}
                  className={`border-b border-slate-100 ${line.key === selected ? 'bg-teal-50' : ''}`}
                >
                  <td className={CELL}>{index + 1}</td>
                  <td className={CELL}>
                    <span className="font-mono text-sm text-slate-500">{line.product.sku}</span>{' '}
                    {line.product.name}
                  </td>
                  <td className={`${CELL} text-right`}>
                    <button
                      type="button"
                      onClick={() => onSelect(line.key)}
                      aria-label={draft.editQty(index + 1, formatQty(line.qty))}
                      className="min-h-11 min-w-16 rounded-lg border border-slate-300 px-3 text-right font-semibold hover:bg-teal-50"
                    >
                      {formatQty(line.qty)}
                    </button>
                  </td>
                  <td className={CELL}>
                    {labels.sales.unitWithFactor(
                      line.unit.label,
                      formatQty(line.unit.factor),
                      line.product.baseUnit,
                    )}
                  </td>
                  <td className={`${CELL} text-right whitespace-nowrap`}>
                    {formatMga(line.unit.price)}
                  </td>
                  <td className={`${CELL} text-right whitespace-nowrap`}>
                    {formatMga(amounts[index] ?? '0')}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td className={CELL} colSpan={5}>
                  {draft.grossTotal}
                </td>
                <td className={`${CELL} text-right whitespace-nowrap`}>
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
