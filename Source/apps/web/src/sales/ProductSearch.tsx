import {
  formatQty,
  parseQuickEntry,
  type CategorySummary,
  type ProductHit,
  type ProductSearchResult,
} from '@vente-web/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { catalogApi } from '../api/catalog.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { BarcodeScanner } from './BarcodeScanner.js';
import { scanFeedback } from './feedback.js';
import { FavoriteTile, HitCard } from './HitCard.js';
import { useProductSearch, type SearchState } from './useProductSearch.js';

export interface ProductSearchProps {
  /** `qty` null adds 1, or 1 more to the same article in the same unit. */
  onAdd: (hit: ProductHit, unitId: string, qty: string | null) => void;
}

type Notice = { ok: boolean; text: string };
type Favorites =
  | { status: 'loading' }
  | { status: 'done'; items: ProductHit[] }
  | { status: 'error'; message: string };

/** Keys typed outside any field — a Bluetooth/USB scanner — go to the search field (RG-DEV-06 §2). */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('input, textarea, select, [contenteditable="true"]') !== null
  );
}

/**
 * The single search field of the quote screen (RG-DEV-06): code, barcode or words; Enter or a
 * scan adds an exact match at once; « 12*CODE » sets the quantity; favorites when empty.
 */
export function ProductSearch({ onAdd }: ProductSearchProps) {
  const [text, setText] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [favorites, setFavorites] = useState<Favorites>({ status: 'loading' });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();

  const entry = parseQuickEntry(text);
  const { state, lookup } = useProductSearch(entry.term, categoryId);

  useEffect(() => {
    const controller = new AbortController();
    // The filter is optional: without categories the search still works.
    catalogApi.categories(controller.signal).then(setCategories, () => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    catalogApi.favorites(categoryId, controller.signal).then(
      (items) => setFavorites({ status: 'done', items }),
      (error: unknown) => {
        if (!controller.signal.aborted)
          setFavorites({ status: 'error', message: errorMessage(error) });
      },
    );
    return () => controller.abort();
  }, [categoryId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
      if (!isTyping(event.target)) inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const add = (hit: ProductHit, unitId: string, qty: string | null) => {
    onAdd(hit, unitId, qty);
    const unit = hit.units.find((candidate) => candidate.id === unitId);
    setNotice({
      ok: true,
      text: labels.sales.added(formatQty(qty ?? '1'), unit?.label ?? '', hit.name),
    });
    setText('');
  };

  const fail = (message: string) => {
    setNotice({ ok: false, text: message });
    scanFeedback(false);
  };

  /**
   * A code typed + Enter, or scanned: its exact match is added at once, with a beep. Words
   * rather than a code leave the list on screen for a pick; nothing at all is an error.
   */
  const addExact = async (term: string, qty: string | null) => {
    try {
      const result: ProductSearchResult = await lookup(term);
      const exact = result.exact;
      const hit = exact && result.items.find((item) => item.id === exact.productId);
      if (exact && hit) {
        add(hit, exact.unitId, qty);
        scanFeedback(true);
      } else if (result.items.length === 0) {
        fail(labels.sales.unknownCode(term));
      }
    } catch (error) {
      fail(errorMessage(error));
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (entry.term) void addExact(entry.term, entry.quantity);
  };

  const chooseCategory = (id: string | undefined) => {
    if (id === categoryId) return;
    setCategoryId(id);
    setFavorites({ status: 'loading' });
  };

  return (
    <section className="flex flex-col gap-3" aria-label={labels.sales.search}>
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-label={labels.sales.search}
          aria-describedby={hintId}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="search"
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-lg focus:border-teal-700 focus:outline-none"
        />
        {entry.quantity && (
          <span className="rounded-full bg-teal-100 px-3 py-2 font-semibold text-teal-900">
            {labels.sales.pendingQty(formatQty(entry.quantity))}
          </span>
        )}
        <button
          type="button"
          onClick={() => setScanning(true)}
          className="min-h-12 rounded-xl bg-teal-700 px-5 text-lg font-semibold text-white hover:bg-teal-800"
        >
          {labels.sales.scan}
        </button>
      </form>
      <p id={hintId} className="text-sm text-slate-600">
        {labels.sales.searchHint}
      </p>

      {categories.length > 0 && (
        <div role="group" aria-label={labels.sales.categories} className="flex flex-wrap gap-2">
          {[{ id: undefined, name: labels.sales.allCategories }, ...categories].map((category) => (
            <button
              key={category.id ?? 'all'}
              type="button"
              aria-pressed={category.id === categoryId}
              onClick={() => chooseCategory(category.id)}
              className="min-h-11 rounded-full border border-slate-300 px-4 aria-pressed:border-teal-700 aria-pressed:bg-teal-700 aria-pressed:text-white"
            >
              {category.name}
            </button>
          ))}
        </div>
      )}

      <p
        role="status"
        className={notice?.ok === false ? 'font-semibold text-red-700' : 'text-teal-800'}
      >
        {notice?.text}
      </p>

      {state.status === 'idle' ? (
        <FavoriteList favorites={favorites} onAdd={add} />
      ) : (
        <Results state={state} qty={entry.quantity} onAdd={add} />
      )}

      {scanning && (
        <BarcodeScanner
          onCode={(code) => void addExact(code, null)}
          onClose={() => setScanning(false)}
          notice={notice}
        />
      )}
    </section>
  );
}

function FavoriteList({
  favorites,
  onAdd,
}: {
  favorites: Favorites;
  onAdd: ProductSearchProps['onAdd'];
}) {
  if (favorites.status === 'loading') return <p className="text-slate-600">{labels.loading}</p>;
  if (favorites.status === 'error') return <p className="text-red-700">{favorites.message}</p>;
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-semibold text-slate-800">{labels.sales.favorites}</h2>
      {favorites.items.length === 0 ? (
        <p className="text-slate-600">{labels.sales.noFavorites}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {favorites.items.map((hit) => (
            <FavoriteTile key={hit.id} hit={hit} onPick={(unitId) => onAdd(hit, unitId, null)} />
          ))}
        </ul>
      )}
    </div>
  );
}

interface ResultsProps {
  state: Exclude<SearchState, { status: 'idle' }>;
  qty: string | null;
  onAdd: ProductSearchProps['onAdd'];
}

function Results({ state, qty, onAdd }: ResultsProps) {
  if (state.status === 'error') return <p className="text-red-700">{state.message}</p>;
  const result = state.status === 'done' ? state.result : state.previous;
  if (!result) return <p className="text-slate-600">{labels.sales.searching}</p>;
  return (
    <div className="flex flex-col gap-2" aria-busy={state.status === 'loading'}>
      <h2 className="sr-only">{labels.sales.results}</h2>
      {result.items.length === 0 ? (
        <p className="text-slate-600">{labels.sales.noResult}</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {result.items.map((hit) => (
            <HitCard key={hit.id} hit={hit} onPick={(unitId) => onAdd(hit, unitId, qty)} />
          ))}
        </ul>
      )}
      {result.more && <p className="font-semibold text-amber-800">{labels.sales.refine}</p>}
    </div>
  );
}
