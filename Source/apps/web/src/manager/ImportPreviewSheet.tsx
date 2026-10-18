import { formatAmount, formatQty, type ImportDetail, type ImportLine } from '@vente-web/shared';
import { useState } from 'react';

import { errorMessage } from '../api/error-message.js';
import { importsApi } from '../api/imports.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { Sheet } from '../ui/Sheet.js';

const text = labels.imports;
const ROW = `${CELL} border-b border-rule py-2 align-top`;

function Check({ line }: { line: ImportLine }) {
  if (line.errors.length === 0 && line.warnings.length === 0) return <>{text.ok}</>;
  return (
    <ul className="flex flex-col gap-0.5">
      {line.errors.map((code) => (
        <li key={code} className="font-semibold text-madder">
          {text.errors[code]}
        </li>
      ))}
      {line.warnings.map((code) => (
        <li key={code} className="text-ink-2">
          {text.warnings[code]}
        </li>
      ))}
    </ul>
  );
}

const stock = (line: ImportLine) =>
  line.stockBefore !== null && line.stockAfter !== null
    ? `${formatQty(line.stockBefore)} → ${formatQty(line.stockAfter)}`
    : '';
const price = (line: ImportLine) => {
  if (line.price === null) return line.priceBefore ? formatAmount(line.priceBefore) : '';
  return line.priceBefore
    ? `${formatAmount(line.priceBefore)} → ${formatAmount(line.price)}`
    : formatAmount(line.price);
};

/**
 * RG-IMP-04: the file as it will be recorded, line by line with its errors and warnings, the
 * totals, then « Valider » (every line, or the valid ones only, RG-IMP-05) or « Annuler ».
 */
export function ImportPreviewSheet({
  batch,
  onClose,
  onDone,
}: {
  batch: ImportDetail;
  onClose(): void;
  onDone(): void;
}) {
  const { say } = useStatusLine();
  const [validOnly, setValidOnly] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const open = batch.status === 'PREVIEW';
  const blocked = batch.rowsOk === 0 || (batch.rowsError > 0 && !validOnly);

  const run = (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    action().then(
      () => {
        say(done, 'check');
        onDone();
      },
      (error: unknown) => {
        setBusy(false);
        setFailure(errorMessage(error));
      },
    );
  };
  const commit = () => {
    // An inventory replaces the stock: a second click confirms it (RG-IMP-02).
    if (batch.mode === 'STOCKTAKE' && !confirming) {
      setConfirming(true);
      return;
    }
    run(() => importsApi.commit(batch.id, validOnly), text.committed(batch.fileName));
  };

  const totals: [string, string][] = [
    [text.productsCreated, String(batch.totals.productsCreated)],
    [text.productsUpdated, String(batch.totals.productsUpdated)],
    [text.unitsCreated, String(batch.totals.unitsCreated)],
    [text.qtyIn, formatQty(batch.totals.qtyIn)],
    [text.pricesChanged, String(batch.totals.pricesChanged)],
  ];

  return (
    <Sheet
      title={text.previewTitle(batch.fileName)}
      closeLabel={text.close}
      onClose={onClose}
      width="xl"
      bodyClassName="flex flex-col gap-3"
      footer={
        open && (
          <div className="flex flex-col gap-2">
            {batch.rowsError > 0 && batch.rowsOk > 0 && (
              <label className="flex min-h-12 items-center gap-3">
                <input
                  type="checkbox"
                  checked={validOnly}
                  onChange={(event) => setValidOnly(event.target.checked)}
                  className="size-5"
                />
                {text.validOnly}
              </label>
            )}
            {confirming && (
              <p role="alert" className="font-semibold text-madder">
                {text.stocktakeConfirm}
              </p>
            )}
            {failure && (
              <p role="alert" className="font-semibold text-madder">
                {failure}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => importsApi.cancel(batch.id), text.cancelled)}
                className={buttonClass('secondary', 'lg')}
              >
                {text.cancel}
              </button>
              <button
                type="button"
                disabled={busy || blocked}
                onClick={commit}
                className={buttonClass('primary', 'lg')}
              >
                {text.commit}
              </button>
            </div>
          </div>
        )
      }
    >
      <p className="text-ink-2">
        {text.modes[batch.mode]} · {text.statuses[batch.status]} ·{' '}
        {text.rows(batch.rowsOk, batch.rowsError)}
      </p>
      <section aria-label={text.totals}>
        <h3 className="text-18 font-semibold">{text.totals}</h3>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 sm:max-w-md">
          {totals.map(([term, value]) => (
            <div key={term} className="contents">
              <dt>{term}</dt>
              <dd className="figures text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] table-fixed border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th className={`${HEAD} w-16`}>{text.row}</th>
              <th className={`${HEAD} w-28`}>{text.sku}</th>
              <th className={`${HEAD} w-28`}>{text.unit}</th>
              <th className={`${HEAD} w-24 text-right`}>{text.qty}</th>
              <th className={`${HEAD} w-36 text-right`}>{text.stock}</th>
              <th className={`${HEAD} w-44 text-right`}>{text.price}</th>
              <th className={HEAD}>{text.status}</th>
            </tr>
          </thead>
          <tbody>
            {batch.lines.map((line) => (
              <tr key={line.row}>
                <td className={`${ROW} figures`}>{line.row}</td>
                <td className={ROW}>{line.sku}</td>
                <td className={ROW}>{line.unit}</td>
                <td className={`${ROW} figures text-right`}>
                  {line.qty === null ? '' : formatQty(line.qty)}
                </td>
                <td className={`${ROW} figures text-right`}>{stock(line)}</td>
                <td className={`${ROW} figures text-right`}>{price(line)}</td>
                <td className={ROW}>
                  <Check line={line} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Sheet>
  );
}
