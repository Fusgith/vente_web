import {
  formatQty,
  isQuantity,
  type AdjustmentTooLarge,
  type ProductStock,
} from '@vente-web/shared';
import { useEffect, useId, useRef, useState } from 'react';

import { ApiError } from '../api/client.js';
import { errorMessage } from '../api/error-message.js';
import { stockApi } from '../api/stock.js';
import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';
import { Sheet } from '../ui/Sheet.js';

const text = labels.stock;
const FIELD =
  'h-12 min-w-0 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';

/** The product to adjust, as the alert list or the search names it. */
export interface AdjustedProduct {
  id: string;
  sku: string;
  name: string;
  baseUnit: string;
}

type Direction = 'out' | 'in';

/** A typed quantity, the comma as decimal mark: « 1,5 » → « 1.5 ». */
const typed = (value: string) => value.trim().replace(',', '.');

function refusal(error: unknown, baseUnit: string): string {
  if (error instanceof ApiError && error.code === 'ADJUSTMENT_TOO_LARGE') {
    const { available } = (error.details ?? {}) as Partial<AdjustmentTooLarge>;
    if (available) return text.tooLarge(text.qtyOf(formatQty(available), baseUnit));
  }
  return errorMessage(error);
}

/**
 * A manual adjustment by the manager (RG-STK-05): goods out or in, in any of the product's units,
 * with a reason from the list and a free comment; the stock as it stands shown above, in base
 * unit (RG-STK-01). The API refuses more out than is available (RG-STK-06, ⚠️ H39).
 */
export function AdjustStockSheet({
  product,
  onDone,
  onClose,
}: {
  product: AdjustedProduct;
  onDone: (stock: ProductStock) => void;
  onClose: () => void;
}) {
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [stock, setStock] = useState<ProductStock | null>(null);
  const [direction, setDirection] = useState<Direction>('out');
  const [qty, setQty] = useState('');
  const [unitId, setUnitId] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    stockApi.of(product.id).then(
      (loaded) => {
        if (!live) return;
        setStock(loaded);
        setUnitId(loaded.units[0]?.id ?? '');
      },
      (error: unknown) => live && setFailure(errorMessage(error)),
    );
    return () => {
      live = false;
    };
  }, [product.id]);

  const ready = stock !== null && isQuantity(typed(qty)) && unitId !== '' && reason !== '';
  const submit = () => {
    setBusy(true);
    setFailure(null);
    stockApi
      .adjust(product.id, {
        direction,
        qty: typed(qty),
        productUnitId: unitId,
        reason,
        note: note.trim() || null,
      })
      .then(onDone, (error: unknown) => setFailure(refusal(error, product.baseUnit)))
      .finally(() => setBusy(false));
  };

  const figures = stock && [
    [text.onHand, stock.onHand],
    [text.reserved, stock.reserved],
    [text.available, stock.available],
  ];
  return (
    <Sheet
      title={text.sheetTitle(product.sku, product.name)}
      closeLabel={text.close}
      onClose={onClose}
      width="md"
      initialFocus={field}
      bodyClassName="flex flex-col gap-4"
    >
      {figures && (
        <dl className="grid grid-cols-3 gap-2">
          {figures.map(([label, value]) => (
            <div key={label} className="flex flex-col">
              <dt className="text-14 text-ink-2">{label}</dt>
              <dd className="text-21 font-bold figures">
                {text.qtyOf(formatQty(value ?? '0'), product.baseUnit)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div role="group" aria-label={text.direction} className="flex gap-2">
        {(['out', 'in'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={direction === value}
            onClick={() => setDirection(value)}
            className={buttonClass(
              'secondary',
              'lg',
              'flex-1 aria-pressed:border-indigo aria-pressed:bg-indigo-soft',
            )}
          >
            {text[value]}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 font-semibold">
          {text.qty}
          <input
            ref={field}
            inputMode="decimal"
            autoComplete="off"
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            className={`${FIELD} text-right figures`}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 font-semibold">
          {text.unit}
          <select
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            className={FIELD}
          >
            {stock?.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 font-semibold">
        {text.reason}
        <select
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className={FIELD}
        >
          <option value="" disabled>
            {text.reasonPick}
          </option>
          {stock?.reasons.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${id}-note`} className="font-semibold">
        {text.note}
      </label>
      <textarea
        id={`${id}-note`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
        rows={2}
        className="rounded-control border border-rule-strong bg-white p-3 text-18 text-ink"
      />
      {failure && (
        <p role="alert" className="font-semibold text-madder">
          {failure}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={busy || !ready}
        className={buttonClass(direction === 'out' ? 'destructive' : 'primary', 'lg', 'w-full')}
      >
        {busy ? text.saving : direction === 'out' ? text.submitOut : text.submitIn}
      </button>
    </Sheet>
  );
}
