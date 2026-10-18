import { formatAmount, formatQty, type ProductDetail, type ProductRow } from '@vente-web/shared';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { errorMessage } from '../api/error-message.js';
import { productsApi } from '../api/products.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { NewProductSheet } from './NewProductSheet.js';
import { ProductSheet } from './ProductSheet.js';

const text = labels.products;
const FIELD =
  'h-12 min-w-0 flex-1 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';
const ROW = `${CELL} border-b border-rule py-2 align-top`;

/** « pièce 5 000,00 · paquet ×6 28 000,00 »: each active unit with its current price. */
function UnitPrices({ row }: { row: ProductRow }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {row.units.map((unit) => (
        <li key={unit.label} className="flex justify-between gap-3">
          <span>
            {unit.label}
            {Number(unit.factor) !== 1 && (
              <span className="text-ink-2"> ×{formatQty(unit.factor)}</span>
            )}
          </span>
          <span className="figures">{unit.price ? formatAmount(unit.price) : text.noPrice}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The catalog on screen (T-092, T-019, H65): the manager or the owner finds a product, creates
 * one with its base unit, adds sale units and changes prices — never deletes, only deactivates.
 */
export function ProductsPanel() {
  const { say } = useStatusLine();
  const [query, setQuery] = useState('');
  // The search applied: the typed one on « Chercher », the box at once.
  const [filter, setFilter] = useState({ q: '', inactive: false });
  const [rows, setRows] = useState<ProductRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [failure, setFailure] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // Only the latest request answers: a slow earlier one never brings back an older list.
  const latest = useRef(0);

  const load = useCallback(
    (nextPage = 1) => {
      const request = ++latest.current;
      productsApi.list(filter.q, filter.inactive, nextPage).then(
        (list) => {
          if (request !== latest.current) return;
          setRows((before) => (nextPage === 1 ? list.items : [...(before ?? []), ...list.items]));
          setTotal(list.total);
          setPage(nextPage);
          setFailure(null);
        },
        (error: unknown) => request === latest.current && setFailure(errorMessage(error)),
      );
    },
    [filter],
  );
  useEffect(() => {
    load(1);
    return () => {
      latest.current += 1;
    };
  }, [load]);

  const search = (event: FormEvent) => {
    event.preventDefault();
    setFilter((before) => ({ ...before, q: query.trim() }));
  };
  const created = (product: ProductDetail) => {
    say(text.created(product.sku), 'check');
    setCreating(false);
    setOpenId(product.id);
    load(1);
  };

  return (
    <section
      aria-labelledby="products-title"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 overflow-hidden pb-4`}
    >
      <header className="flex items-baseline justify-between gap-3 px-4 pt-3">
        <h2 id="products-title" className="type-title">
          {text.title}
        </h2>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className={buttonClass('primary', 'md')}
        >
          {text.create}
        </button>
      </header>
      <form onSubmit={search} className="flex flex-col gap-2 px-4">
        <label htmlFor="products-search" className="font-semibold">
          {text.search}
        </label>
        <div className="flex gap-2">
          <input
            id="products-search"
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
        <label className="flex min-h-12 items-center gap-3">
          <input
            type="checkbox"
            checked={filter.inactive}
            onChange={(event) => {
              const checked = event.target.checked;
              setFilter((before) => ({ ...before, inactive: checked }));
            }}
            className="size-5"
          />
          {text.showInactive}
        </label>
      </form>
      {failure && (
        <p role="alert" className="px-4 font-semibold text-madder">
          {failure}
        </p>
      )}
      {rows?.length === 0 && <p className="px-4 text-ink-2">{text.none}</p>}
      {rows && rows.length > 0 && (
        <>
          <p className="px-4 text-ink-2">{text.count(rows.length, total)}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] table-fixed border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  <th className={`${HEAD} w-28`}>{text.sku}</th>
                  <th className={HEAD}>{text.name}</th>
                  <th className={`${HEAD} w-64`}>{text.units}</th>
                  <th className={`${HEAD} w-32 text-right`}>{text.available}</th>
                  <th className={`${HEAD} w-28`}>
                    <span className="sr-only">{text.open}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={row.isActive ? '' : 'text-ink-2'}>
                    <td className={`${ROW} font-semibold figures`}>{row.sku}</td>
                    <td className={ROW}>
                      {row.name}
                      <span className="block text-14 text-ink-2">
                        {row.category ?? text.noCategory}
                        {!row.isActive && `, ${text.inactive}`}
                      </span>
                    </td>
                    <td className={ROW}>
                      <UnitPrices row={row} />
                    </td>
                    <td className={`${ROW} text-right figures`}>
                      {formatQty(row.available)} {row.baseUnit}
                    </td>
                    <td className={ROW}>
                      <button
                        type="button"
                        onClick={() => setOpenId(row.id)}
                        aria-label={text.openOf(row.sku)}
                        className={buttonClass('secondary', 'md', 'w-full px-2')}
                      >
                        {text.open}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length < total && (
            <button
              type="button"
              onClick={() => load(page + 1)}
              className={buttonClass('secondary', 'md', 'mx-4 self-start')}
            >
              {text.more}
            </button>
          )}
        </>
      )}
      {creating && <NewProductSheet onDone={created} onClose={() => setCreating(false)} />}
      {openId && (
        <ProductSheet
          productId={openId}
          onChanged={() => load(1)}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  );
}
