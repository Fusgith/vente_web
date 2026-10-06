import type { ProductHit } from '@vente-web/shared';

import { labels } from '../labels.js';
import { Icon } from '../ui/Icon.js';
import { FavoriteTile, HitRow } from './HitCard.js';
import type { SearchState } from './useProductSearch.js';

type OnAdd = (hit: ProductHit, unitId: string, qty: string | null) => void;

export type Favorites =
  | { status: 'loading' }
  | { status: 'done'; items: ProductHit[]; promoted: ProductHit[] }
  | { status: 'error'; message: string };

const quiet = 'text-14 text-ink-2';

function Tiles({ hits, onAdd }: { hits: ProductHit[]; onAdd: OnAdd }) {
  return (
    <ul className="grid grid-cols-2 gap-2 @md:grid-cols-3 @3xl:grid-cols-4">
      {hits.map((hit) => (
        <FavoriteTile key={hit.id} hit={hit} onPick={(unitId) => onAdd(hit, unitId, null)} />
      ))}
    </ul>
  );
}

/**
 * While the field is empty: the products the owner wants proposed today, if any (RG-DEV-06 §6),
 * then the 12 best sellers (§5); one tap adds.
 */
export function FavoriteList({ favorites, onAdd }: { favorites: Favorites; onAdd: OnAdd }) {
  if (favorites.status === 'loading') return <p className={quiet}>{labels.loading}</p>;
  if (favorites.status === 'error') return <p className="text-madder">{favorites.message}</p>;
  return (
    <div className="@container flex flex-col gap-2">
      {favorites.promoted.length > 0 && (
        <>
          <h2 className="text-14 font-semibold text-ink-2">{labels.sales.promoted}</h2>
          <Tiles hits={favorites.promoted} onAdd={onAdd} />
        </>
      )}
      <h2 className="text-14 font-semibold text-ink-2">{labels.sales.favorites}</h2>
      {favorites.items.length === 0 ? (
        <p className={quiet}>{labels.sales.noFavorites}</p>
      ) : (
        <Tiles hits={favorites.items} onAdd={onAdd} />
      )}
    </div>
  );
}

interface ResultsProps {
  state: Exclude<SearchState, { status: 'idle' }>;
  qty: string | null;
  onAdd: OnAdd;
}

/**
 * At most 8 compact rows, all in view at 1280 × 800. « No result » and errors are said in the
 * frame's status band, not here.
 */
export function Results({ state, qty, onAdd }: ResultsProps) {
  if (state.status === 'error') return null;
  const result = state.status === 'done' ? state.result : state.previous;
  if (!result) return <p className={quiet}>{labels.sales.searching}</p>;
  if (result.items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1" aria-busy={state.status === 'loading'}>
      <ul className="@container flex flex-col">
        {result.items.map((hit) => (
          <HitRow key={hit.id} hit={hit} onPick={(unitId) => onAdd(hit, unitId, qty)} />
        ))}
      </ul>
      {result.more && (
        <p className="flex items-center gap-2 text-14 text-ink-2">
          <Icon name="info" className="size-5 text-indigo" />
          {labels.sales.refine}
        </p>
      )}
    </div>
  );
}
