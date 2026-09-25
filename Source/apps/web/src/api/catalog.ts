import {
  categoriesResultSchema,
  favoritesResultSchema,
  productSearchResultSchema,
  type CategorySummary,
  type ProductHit,
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

  async favorites(categoryId?: string, signal?: AbortSignal): Promise<ProductHit[]> {
    const data = await apiRequest(
      withQuery('/products/favorites', { categoryId }),
      signal ? { signal } : {},
    );
    return parseResponse(favoritesResultSchema, data).items;
  },

  async categories(signal?: AbortSignal): Promise<CategorySummary[]> {
    const data = await apiRequest('/categories', signal ? { signal } : {});
    return parseResponse(categoriesResultSchema, data).items;
  },
};
