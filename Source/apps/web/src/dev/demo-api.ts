import {
  defaultSaleUnit,
  SEARCH_MAX_RESULTS,
  type ProductHit,
  type ProductSearchResult,
} from '@vente-web/shared';

import { API_BASE } from '../api/client.js';
import { CATEGORIES, DIRECTORY, FAVORITES, PRODUCTS } from './fixtures.js';

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

function search(term: string, categoryId: string | null): ProductSearchResult {
  const wanted = fold(term);
  const inCategory = (hit: ProductHit) => !categoryId || hit.category?.id === categoryId;
  const items = Object.values(PRODUCTS).filter(
    (hit) => inCategory(hit) && fold(`${hit.sku} ${hit.name}`).includes(wanted),
  );
  const match = items.find((hit) => fold(hit.sku) === wanted);
  const unit = match && defaultSaleUnit(match.units);
  return {
    exact: match && unit ? { productId: match.id, unitId: unit.id } : null,
    items: items.slice(0, SEARCH_MAX_RESULTS),
    more: items.length > SEARCH_MAX_RESULTS,
  };
}

function answer(url: URL): unknown {
  const categoryId = url.searchParams.get('categoryId');
  switch (url.pathname.slice(API_BASE.length)) {
    case '/auth/users':
      return DIRECTORY;
    case '/categories':
      return { items: CATEGORIES };
    case '/products/favorites':
      return { items: FAVORITES.filter((hit) => !categoryId || hit.category?.id === categoryId) };
    case '/products/search':
      return search(url.searchParams.get('q') ?? '', categoryId);
    default:
      return undefined;
  }
}

/** Answers the catalog and directory calls from the fixtures; everything else fails as offline. */
export function installDemoApi(): void {
  window.fetch = (input) => {
    const href = input instanceof Request ? input.url : String(input);
    const url = new URL(href, window.location.href);
    const body = answer(url);
    if (body === undefined) return Promise.reject(new TypeError('Demo API: no fixture'));
    return Promise.resolve(
      new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
    );
  };
}
