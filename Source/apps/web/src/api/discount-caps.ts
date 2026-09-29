import {
  discountCapsSchema,
  productDiscountCapsSchema,
  type DiscountCaps,
  type ProductDiscountCaps,
} from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

const put = (path: string, pct: string | null) =>
  apiRequest(path, { method: 'PUT', body: { pct } });

/** Discount caps (T-024, RG-REM-01): read by most roles, set by the owner alone (H15). */
export const discountCapsApi = {
  async list(): Promise<DiscountCaps> {
    return parseResponse(discountCapsSchema, await apiRequest('/discount-caps'));
  },
  async ofProduct(productId: string): Promise<ProductDiscountCaps> {
    return parseResponse(
      productDiscountCapsSchema,
      await apiRequest(`/products/${productId}/discount-caps`),
    );
  },
  async setDefault(pct: string): Promise<DiscountCaps> {
    return parseResponse(discountCapsSchema, await put('/discount-caps/default', pct));
  },
  async setCategory(categoryId: string, pct: string | null): Promise<DiscountCaps> {
    return parseResponse(
      discountCapsSchema,
      await put(`/categories/${categoryId}/discount-cap`, pct),
    );
  },
  async setProduct(productId: string, pct: string | null): Promise<ProductDiscountCaps> {
    return parseResponse(
      productDiscountCapsSchema,
      await put(`/products/${productId}/discount-cap`, pct),
    );
  },
  async setUnit(unitId: string, pct: string | null): Promise<ProductDiscountCaps> {
    return parseResponse(
      productDiscountCapsSchema,
      await put(`/product-units/${unitId}/discount-cap`, pct),
    );
  },
};
