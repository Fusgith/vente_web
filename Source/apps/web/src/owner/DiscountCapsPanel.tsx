import {
  formatQty,
  type DiscountCaps,
  type ProductDiscountCaps,
  type ProductHit,
} from '@vente-web/shared';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { catalogApi } from '../api/catalog.js';
import { discountCapsApi } from '../api/discount-caps.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { CapField } from './CapField.js';
import { ProductCaps } from './ProductCaps.js';

const text = labels.caps;
const FIELD =
  'h-12 min-w-0 flex-1 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';
const ROW = `${CELL} h-14 border-b border-rule py-1`;
const pctOf = (pct: string | null) => (pct === null ? null : formatQty(pct));

/**
 * The discount caps (T-024, RG-REM-01): the general one, each category's, and any product's, level
 * by level. The owner sets them (H15); the manager reads them. A quote takes a new cap at its next
 * save; a validated order keeps its own (H40).
 */
export function DiscountCapsPanel({ editable }: { editable: boolean }) {
  const { say } = useStatusLine();
  const [caps, setCaps] = useState<DiscountCaps | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ProductHit[] | null>(null);
  const [product, setProduct] = useState<ProductDiscountCaps | null>(null);
  // Only the latest product asked for answers: a slow earlier one never replaces it.
  const latest = useRef(0);

  useEffect(() => {
    let live = true;
    discountCapsApi.list().then(
      (list) => live && setCaps(list),
      (error: unknown) => live && setFailure(errorMessage(error)),
    );
    return () => {
      live = false;
    };
  }, []);

  const open = useCallback((productId: string) => {
    const request = ++latest.current;
    discountCapsApi.ofProduct(productId).then(
      (found) => request === latest.current && setProduct(found),
      (error: unknown) => request === latest.current && setFailure(errorMessage(error)),
    );
  }, []);

  /** Saves one cap, then tells which and how much in the status line. */
  const save = <T,>(said: string, request: Promise<T>, apply: (value: T) => void) =>
    request.then(
      (value) => {
        apply(value);
        setFailure(null);
        say(said, 'check');
      },
      (error: unknown) => setFailure(errorMessage(error)),
    );
  // The general and category caps flow into the open product's: it is read again.
  const listSaved = (list: DiscountCaps) => {
    setCaps(list);
    if (product) open(product.productId);
  };

  const search = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    catalogApi.search(q).then(
      (result) => setHits(result.items),
      (error: unknown) => setFailure(errorMessage(error)),
    );
  };

  return (
    <section
      aria-labelledby="discount-caps"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 overflow-hidden pb-4`}
    >
      <header className="flex flex-col gap-1 px-4 pt-3">
        <h2 id="discount-caps" className="type-title">
          {text.title}
        </h2>
        <p className="text-ink-2">{editable ? `${text.help} ${text.emptyHelp}` : text.readOnly}</p>
      </header>
      {failure && (
        <p role="alert" className="px-4 font-semibold text-madder">
          {failure}
        </p>
      )}
      {caps && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4">
            <span className="flex flex-col">
              <span className="font-semibold">{text.general}</span>
              <span className="text-ink-2">{text.generalHelp}</span>
            </span>
            <CapField
              label={text.generalField}
              saveLabel={text.generalSave}
              value={caps.defaultPct}
              nullable={false}
              editable={editable}
              onSave={(pct) =>
                save(
                  text.generalSaved(formatQty(pct ?? '')),
                  discountCapsApi.setDefault(pct ?? ''),
                  listSaved,
                )
              }
            />
          </div>
          {caps.categories.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] table-fixed border-separate border-spacing-0 text-left">
                <thead>
                  <tr>
                    <th className={HEAD}>{text.category}</th>
                    <th className={`${HEAD} w-64`}>{text.cap}</th>
                  </tr>
                </thead>
                <tbody>
                  {caps.categories.map((category) => (
                    <tr key={category.id}>
                      <td className={`${ROW} font-semibold`}>{category.name}</td>
                      <td className={ROW}>
                        <CapField
                          label={text.capOf(category.name)}
                          saveLabel={text.saveOf(category.name)}
                          value={category.maxDiscountPct}
                          nullable
                          editable={editable}
                          onSave={(pct) =>
                            save(
                              text.saved(category.name, pctOf(pct)),
                              discountCapsApi.setCategory(category.id, pct),
                              listSaved,
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <form onSubmit={search} className="flex flex-col gap-2 px-4 pt-2">
        <label htmlFor="caps-search" className="font-semibold">
          {text.search}
        </label>
        <div className="flex gap-2">
          <input
            id="caps-search"
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
        {hits && hits.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onClick={() => open(hit.id)}
                  aria-pressed={product?.productId === hit.id}
                  className={buttonClass('secondary', 'md')}
                >
                  {text.open(hit.sku, hit.name)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>
      {product && (
        <ProductCaps
          caps={product}
          editable={editable}
          onSaveProduct={(pct) =>
            save(
              text.saved(product.sku, pctOf(pct)),
              discountCapsApi.setProduct(product.productId, pct),
              setProduct,
            )
          }
          onSaveUnit={(unitId, label, pct) =>
            save(
              text.saved(`${product.sku}, ${label}`, pctOf(pct)),
              discountCapsApi.setUnit(unitId, pct),
              setProduct,
            )
          }
        />
      )}
    </section>
  );
}
