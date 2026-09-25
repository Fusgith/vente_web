import {
  FAVORITES_COUNT,
  FAVORITES_DAYS,
  SEARCH_MAX_RESULTS,
  SEARCH_MIN_LENGTH,
  defaultSaleUnit,
  searchTokens,
  type CategorySummary,
  type ProductHit,
  type ProductSearchQuery,
  type ProductSearchResult,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { Prisma } from '../generated/prisma/client.js';
import { loadHits, type HitOptions } from './product-hits.js';

interface ExactMatch {
  productId: string;
  /** Unit of the scanned barcode; null for a product code (unit chosen from the hit). */
  unitId: string | null;
}

/** An exact barcode wins over an exact product code (RG-DEV-06 §2). Inactive items never match. */
async function findExact(db: Db, term: string): Promise<ExactMatch | null> {
  const unit = await db.productUnit.findFirst({
    where: { barcode: term, isActive: true, product: { isActive: true } },
    select: { id: true, productId: true },
  });
  if (unit) return { productId: unit.productId, unitId: unit.id };
  // lower(sku) is the unique index of the init migration: codes are case-insensitive.
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "products" WHERE lower("sku") = lower(${term}) AND "is_active"`;
  const product = rows[0];
  return product ? { productId: product.id, unitId: null } : null;
}

/**
 * The unit a direct add goes to: the scanned one; for a product code, the base unit when it is
 * sellable, else the smallest active unit with a price (RG-DEV-06 §2, RG-ART-03).
 */
function exactUnit(hit: ProductHit, match: ExactMatch): string | null {
  if (!match.unitId) return defaultSaleUnit(hit.units)?.id ?? null;
  const scanned = hit.units.find((unit) => unit.id === match.unitId);
  return scanned?.price ? scanned.id : null;
}

/**
 * Word-prefix match on every token, any order, case and accents ignored: `search_text` holds
 * « ␠word␠word… » normalized by the same `search_normalize` (migration add_product_search).
 * Tokens carry letters and digits only, so they never inject LIKE wildcards.
 */
function tokenConditions(tokens: string[]): Prisma.Sql {
  if (tokens.length === 0) return Prisma.sql`FALSE`;
  return Prisma.join(
    tokens.map(
      (token) => Prisma.sql`p."search_text" LIKE '% ' || search_normalize(${token}) || '%'`,
    ),
    ' AND ',
  );
}

/**
 * Ranking of RG-DEV-06 §1: exact code, then code prefix (in code order), then the closest
 * designation.
 */
async function rankedIds(
  db: Db,
  term: string,
  exactId: string | null,
  categoryId: string | undefined,
): Promise<string[]> {
  const tokens = term.length >= SEARCH_MIN_LENGTH ? searchTokens(term) : [];
  const inCategory = categoryId
    ? Prisma.sql`p."category_id" = ${categoryId}::uuid`
    : Prisma.sql`TRUE`;
  const codePrefix = Prisma.sql`starts_with(lower(p."sku"), lower(${term}))`;
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT p."id"
      FROM "products" p
     WHERE p."is_active"
       AND (p."id" = ${exactId}::uuid OR (${inCategory} AND ${tokenConditions(tokens)}))
     ORDER BY CASE
                WHEN p."id" = ${exactId}::uuid THEN 0
                WHEN ${codePrefix} THEN 1
                ELSE 2
              END,
              CASE WHEN ${codePrefix} THEN p."sku" END,
              similarity(p."search_text", search_normalize(${term})) DESC,
              p."name",
              p."sku"
     LIMIT ${SEARCH_MAX_RESULTS + 1}`;
  return rows.map((row) => row.id);
}

export async function searchProducts(
  db: Db,
  query: ProductSearchQuery,
  options: HitOptions,
): Promise<ProductSearchResult> {
  const term = query.q;
  const match = await findExact(db, term);
  const ids = await rankedIds(db, term, match?.productId ?? null, query.categoryId);
  const items = await loadHits(db, ids.slice(0, SEARCH_MAX_RESULTS), options);

  const exactHit = match && items.find((item) => item.id === match.productId);
  const unitId = match && exactHit ? exactUnit(exactHit, match) : null;
  return {
    exact: match && unitId ? { productId: match.productId, unitId } : null,
    items,
    more: ids.length > SEARCH_MAX_RESULTS,
  };
}

/** Orders that count as sold: validated and not cancelled, expired or refunded. */
const SOLD = Prisma.sql`('SUBMITTED', 'AT_REGISTER', 'PAID', 'PREPARING', 'READY', 'ISSUE', 'DELIVERED')`;

async function bestSellers(
  db: Db,
  salesUserId: string | null,
  categoryId: string | undefined,
): Promise<string[]> {
  const bySeller = salesUserId
    ? Prisma.sql`o."sales_user_id" = ${salesUserId}::uuid`
    : Prisma.sql`TRUE`;
  const inCategory = categoryId
    ? Prisma.sql`p."category_id" = ${categoryId}::uuid`
    : Prisma.sql`TRUE`;
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT p."id"
      FROM "order_lines" l
      JOIN "orders" o ON o."id" = l."order_id"
      JOIN "products" p ON p."id" = l."product_id"
     WHERE o."status"::text IN ${SOLD}
       AND o."submitted_at" >= now() - make_interval(days => ${FAVORITES_DAYS})
       AND p."is_active"
       AND ${bySeller}
       AND ${inCategory}
     GROUP BY p."id", p."sku"
     ORDER BY count(DISTINCT o."id") DESC, p."sku"
     LIMIT ${FAVORITES_COUNT}`;
  return rows.map((row) => row.id);
}

/** The 12 best sellers of this salesperson over 30 days, completed by the shop's (RG-DEV-06 §5). */
export async function favoriteProducts(
  db: Db,
  userId: string,
  categoryId: string | undefined,
  options: HitOptions,
): Promise<ProductHit[]> {
  const mine = await bestSellers(db, userId, categoryId);
  const shop = mine.length < FAVORITES_COUNT ? await bestSellers(db, null, categoryId) : [];
  const ids = [...new Set([...mine, ...shop])].slice(0, FAVORITES_COUNT);
  return loadHits(db, ids, options);
}

/** Active categories, for the optional filter of the search (RG-DEV-06 §5). */
export async function activeCategories(db: Db): Promise<CategorySummary[]> {
  return db.category.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}
