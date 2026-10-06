import {
  favoritesQuerySchema,
  productSearchQuerySchema,
  type CategorySummary,
  type FavoritesResult,
  type ProductSearchResult,
  type Role,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';

import { authOf, requireAuth } from '../plugins/session.js';
import {
  activeCategories,
  favoriteProducts,
  promotedProducts,
  searchProducts,
} from '../services/product-search.js';

/** Annexe B: every role reads the catalog, all but the warehouse read the discount caps. */
const CAP_READERS: readonly Role[] = ['admin', 'manager', 'sales', 'cashier', 'owner'];

/** Quick search of the quote screen (RG-DEV-06); catalog writes come with T-019 and T-020. */
export const catalogRoutes: FastifyPluginAsync = async (app) => {
  const signedIn = { preHandler: requireAuth };

  app.get('/products/search', signedIn, async (request): Promise<ProductSearchResult> => {
    const auth = authOf(request);
    const query = productSearchQuerySchema.parse(request.query);
    return searchProducts(app.db, query, {
      showCaps: CAP_READERS.includes(auth.session.activeRole),
    });
  });

  app.get('/products/favorites', signedIn, async (request): Promise<FavoritesResult> => {
    const auth = authOf(request);
    const { categoryId } = favoritesQuerySchema.parse(request.query);
    const options = { showCaps: CAP_READERS.includes(auth.session.activeRole) };
    const [items, promoted] = await Promise.all([
      favoriteProducts(app.db, auth.user.id, categoryId, options),
      promotedProducts(app.db, categoryId, options),
    ]);
    return { items, promoted };
  });

  app.get('/categories', signedIn, async (): Promise<{ items: CategorySummary[] }> => ({
    items: await activeCategories(app.db),
  }));
};
