import {
  categoriesResultSchema,
  favoritesResultSchema,
  productSearchResultSchema,
  type CategorySummary,
  type FavoritesResult,
  type ProductSearchResult,
} from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

function withQuery(path: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value);
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/** Quick search of the quote screen (T-021, RG-DEV-06). */
export const catalogApi = {
  async search(q: string, categoryId?: string, signal?: AbortSignal): Promise<ProductSearchResult> {
    const data = await apiRequest(
      withQuery('/products/search', { q, categoryId }),
      signal ? { signal } : {},
    );
    return parseResponse(productSearchResultSchema, data);
  },

  /** The best sellers and the products to propose today (RG-DEV-06 §5 and §6). */
  async favorites(categoryId?: string, signal?: AbortSignal): Promise<FavoritesResult> {
    const data = await apiRequest(
      withQuery('/products/favorites', { categoryId }),
      signal ? { signal } : {},
    );
    return parseResponse(favoritesResultSchema, data);
  },

  async categories(signal?: AbortSignal): Promise<CategorySummary[]> {
    const data = await apiRequest('/categories', signal ? { signal } : {});
    return parseResponse(categoriesResultSchema, data).items;
  },
};
