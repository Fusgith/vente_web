import {
  formatQty,
  parseQuickEntry,
  type CategorySummary,
  type ProductHit,
  type ProductSearchResult,
} from '@vente-web/shared';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { catalogApi } from '../api/catalog.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { BarcodeScanner } from './BarcodeScanner.js';
import { CategoryPicker } from './CategoryPicker.js';
import { scanFeedback } from './feedback.js';
import { FavoriteList, Results, type Favorites } from './SearchLists.js';
import { useProductSearch } from './useProductSearch.js';

export interface ProductSearchProps {
  /** `qty` null adds 1, or 1 more to the same article in the same unit. */
  onAdd: (hit: ProductHit, unitId: string, qty: string | null) => void;
  /** The quantity pad of the line being edited: it takes the place of the lists. */
  pad?: ReactNode | undefined;
  /** Called on every change of the field (the workspace closes the pad: typing is searching). */
  onType?: (() => void) | undefined;
}

/** Keys typed outside any field — a Bluetooth/USB scanner — go to the search field (RG-DEV-06 §2). */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('input, textarea, select, [contenteditable="true"]') !== null
  );
}

/**
 * The tool pane of the quote screen (RG-DEV-06): one field for a code, a barcode or words; Enter
 * or a scan adds an exact match at once; « 12*CODE » sets the quantity. Below it, one thing at a
 * time: the best sellers, the results, or the pad of the line being edited. What happened is said
 * in the frame's status band.
 */
export function ProductSearch({ onAdd, pad, onType }: ProductSearchProps) {
  const [text, setText] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [favorites, setFavorites] = useState<Favorites>({ status: 'loading' });
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /** The term whose « nothing found » was already said, so it is said once. */
  const spokenRef = useRef<string | null>(null);
  const hintId = useId();
  const { say, sayError } = useStatusLine();

  const entry = parseQuickEntry(text);
  const { state, lookup } = useProductSearch(entry.term, categoryId);
  const noMatch = state.status === 'done' && state.result.items.length === 0 ? entry.term : null;
  const searchError = state.status === 'error' ? state.message : null;
  const showHint = text === '' && !pad;

  useEffect(() => {
    const controller = new AbortController();
    // The filter is optional: without categories the search still works.
    catalogApi.categories(controller.signal).then(setCategories, () => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    catalogApi.favorites(categoryId, controller.signal).then(
      (lists) => setFavorites({ status: 'done', ...lists }),
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
      // Space presses the focused button (a pad key, a tile): a scanner never sends one.
      if (event.key === ' ') return;
      if (!isTyping(event.target)) inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (noMatch === null) {
      spokenRef.current = null;
    } else if (spokenRef.current !== noMatch) {
      spokenRef.current = noMatch;
      say(labels.sales.noResult, 'info');
    }
  }, [noMatch, say]);

  useEffect(() => {
    if (searchError) sayError(searchError);
  }, [searchError, sayError]);

  const add = (hit: ProductHit, unitId: string, qty: string | null) => {
    onAdd(hit, unitId, qty);
    const unit = hit.units.find((candidate) => candidate.id === unitId);
    say(labels.sales.added(formatQty(qty ?? '1'), unit?.label ?? '', hit.name), 'check');
    setText('');
  };

  const fail = (message: string) => {
    sayError(message);
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
        // The unknown code replaces the « nothing found » of the same term.
        spokenRef.current = term;
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

  const change = (value: string) => {
    setText(value);
    onType?.();
  };

  const chooseCategory = (id: string | undefined) => {
    if (id === categoryId) return;
    setCategoryId(id);
    setFavorites({ status: 'loading' });
  };

  return (
    <section className="flex min-h-0 flex-col gap-2" aria-label={labels.sales.search}>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <div className="focus-within-ring flex min-h-14 items-center gap-2 rounded-control border border-rule-strong bg-white pr-1 pl-3">
          <Icon name="search" className="size-6 text-ink-2" />
          <input
            ref={inputRef}
            type="search"
            value={text}
            onChange={(event) => change(event.target.value)}
            aria-label={labels.sales.search}
            aria-describedby={showHint ? hintId : undefined}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="search"
            className="h-13 min-w-0 flex-1 bg-transparent text-18 text-ink outline-none [&::-webkit-search-cancel-button]:appearance-none"
          />
          {entry.quantity && (
            <span className="shrink-0 rounded-full bg-saffron-soft px-3 py-1 text-16 font-semibold figures">
              {labels.sales.pendingQty(formatQty(entry.quantity))}
            </span>
          )}
          {text !== '' && (
            <button
              type="button"
              aria-label={labels.sales.clearSearch}
              onClick={() => {
                change('');
                inputRef.current?.focus();
              }}
              className="flex size-12 shrink-0 items-center justify-center rounded-control text-ink-2 focus-inset active:bg-indigo-soft"
            >
              <Icon name="close" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setScanning(true)}
            className={buttonClass('secondary', 'md', 'shrink-0')}
          >
            <Icon name="scan" />
            {labels.sales.scan}
          </button>
          <CategoryPicker categories={categories} value={categoryId} onChange={chooseCategory} />
        </div>
      </form>
      {showHint && (
        <p id={hintId} className="text-14 text-ink-2">
          {labels.sales.searchHint}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col pt-1 md:overflow-y-auto">
        {pad ??
          (state.status === 'idle' ? (
            <FavoriteList favorites={favorites} onAdd={add} />
          ) : (
            <Results state={state} qty={entry.quantity} onAdd={add} />
          ))}
      </div>

      {scanning && (
        <BarcodeScanner
          onCode={(code) => void addExact(code, null)}
          onClose={() => setScanning(false)}
        />
      )}
    </section>
  );
}
