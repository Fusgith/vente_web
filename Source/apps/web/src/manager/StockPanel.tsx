import { formatQty, type ProductHit, type ProductStock, type StockAlert } from '@vente-web/shared';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { catalogApi } from '../api/catalog.js';
import { errorMessage } from '../api/error-message.js';
import { stockApi } from '../api/stock.js';
import { labels } from '../labels.js';
import { useRealtimeConnect, useRealtimeEvent } from '../realtime/context.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { AdjustStockSheet, type AdjustedProduct } from './AdjustStockSheet.js';

const text = labels.stock;
const FIELD =
  'h-12 min-w-0 flex-1 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';

const ROW = `${CELL} h-14 border-b border-rule py-1`;

/** The alert list and the search results, alike: code, name, figures, then « Ajuster ». */
function ProductTable({ figures, children }: { figures: readonly string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] table-fixed border-separate border-spacing-0 text-left">
        <thead>
          <tr>
            <th className={`${HEAD} w-28`}>{text.sku}</th>
            <th className={HEAD}>{text.name}</th>
            {figures.map((label) => (
              <th key={label} className={`${HEAD} w-36 text-right`}>
                {label}
              </th>
            ))}
            <th className={`${HEAD} w-28`}>
              <span className="sr-only">{text.adjust}</span>
            </th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** One product to adjust. */
function Row({
  product,
  figures,
  onAdjust,
}: {
  product: AdjustedProduct;
  figures: readonly string[];
  onAdjust: (product: AdjustedProduct) => void;
}) {
  return (
    <tr>
      <td className={`${ROW} font-semibold figures`}>{product.sku}</td>
      <td className={`${ROW} truncate`}>{product.name}</td>
      {figures.map((value, index) => (
        <td key={index} className={`${ROW} text-right figures`}>
          {text.qtyOf(formatQty(value), product.baseUnit)}
        </td>
      ))}
      <td className={ROW}>
        <button
          type="button"
          onClick={() => onAdjust(product)}
          aria-label={text.adjustOf(product.sku)}
          className={buttonClass('secondary', 'md', 'w-full px-2')}
        >
          {text.adjust}
        </button>
      </td>
    </tr>
  );
}

/**
 * The manager's stock (T-023): the products at or under their alert threshold, told live of each
 * new one (RG-STK-07); any product found by code or name, adjusted with a reason (RG-STK-05).
 */
export function StockPanel() {
  const { say } = useStatusLine();
  const [alerts, setAlerts] = useState<StockAlert[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ProductHit[] | null>(null);
  const [adjusting, setAdjusting] = useState<AdjustedProduct | null>(null);
  // Only the latest request answers: a slow earlier one never brings back an older list.
  const latest = useRef(0);
  const known = useRef<Set<string> | null>(null);
  const load = useCallback(() => {
    const request = ++latest.current;
    stockApi.alerts().then(
      (list) => {
        if (request !== latest.current) return;
        // Products newly under their threshold are told; the first load only shows the list.
        const before = known.current;
        for (const alert of list) {
          if (before && !before.has(alert.productId)) {
            say(text.newAlert(alert.sku, alert.name), 'alert');
          }
        }
        known.current = new Set(list.map((alert) => alert.productId));
        setAlerts(list);
        setFailure(null);
      },
      (error: unknown) => request === latest.current && setFailure(errorMessage(error)),
    );
  }, [say]);
  useEffect(() => {
    load();
    return () => {
      latest.current += 1;
    };
  }, [load]);
  useRealtimeConnect(load);
  useRealtimeEvent('stock.alert', load);
  useRealtimeEvent('order.status_changed', load);

  const search = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    catalogApi.search(q).then(
      (result) => setHits(result.items),
      (error: unknown) => setFailure(errorMessage(error)),
    );
  };
  const done = (product: AdjustedProduct, stock: ProductStock) => {
    say(text.adjusted(product.sku, text.qtyOf(formatQty(stock.onHand), product.baseUnit)), 'check');
    setAdjusting(null);
    setHits(
      (list) =>
        list?.map((hit) =>
          hit.id === product.id ? { ...hit, available: stock.available } : hit,
        ) ?? null,
    );
    load();
  };

  return (
    <section
      aria-labelledby="stock-alerts"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 overflow-hidden pb-4`}
    >
      <header className="flex items-baseline justify-between gap-3 px-4 pt-3">
        <h2 id="stock-alerts" className="type-title">
          {text.alerts}
        </h2>
        <button type="button" onClick={load} className={buttonClass('secondary', 'md')}>
          {text.refresh}
        </button>
      </header>
      {failure && (
        <p role="alert" className="px-4 font-semibold text-madder">
          {failure}
        </p>
      )}
      {alerts?.length === 0 && <p className="px-4 text-ink-2">{text.alertsNone}</p>}
      {alerts && alerts.length > 0 && (
        <ProductTable figures={[text.available, text.threshold]}>
          {alerts.map((alert) => (
            <Row
              key={alert.productId}
              product={{ ...alert, id: alert.productId }}
              figures={[alert.available, alert.alertThreshold]}
              onAdjust={setAdjusting}
            />
          ))}
        </ProductTable>
      )}
      <form onSubmit={search} className="flex flex-col gap-2 px-4 pt-2">
        <label htmlFor="stock-search" className="font-semibold">
          {text.search}
        </label>
        <div className="flex gap-2">
          <input
            id="stock-search"
            type="search"
            autoComplete="off"
            placeholder={text.searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={FIELD}
          />
          <button type="submit" className={buttonClass('secondary', 'lg')}>
            {text.searchGo}
          </button>
        </div>
        {hits?.length === 0 && <p className="text-ink-2">{text.searchNone}</p>}
      </form>
      {hits && hits.length > 0 && (
        <ProductTable figures={[text.available]}>
          {hits.map((hit) => (
            <Row key={hit.id} product={hit} figures={[hit.available]} onAdjust={setAdjusting} />
          ))}
        </ProductTable>
      )}
      {adjusting && (
        <AdjustStockSheet
          product={adjusting}
          onDone={(stock) => done(adjusting, stock)}
          onClose={() => setAdjusting(null)}
        />
      )}
    </section>
  );
}
