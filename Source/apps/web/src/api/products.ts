import {
  productDetailSchema,
  productListSchema,
  type PriceSet,
  type ProductCreate,
  type ProductDetail,
  type ProductList,
  type ProductUpdate,
  type UnitCreate,
  type UnitUpdate,
} from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

const detail = async (data: unknown) => parseResponse(productDetailSchema, data);

/** Products, sale units and dated prices on screen (T-092, T-019, T-019b). */
export const productsApi = {
  async list(q: string, inactive: boolean, page = 1): Promise<ProductList> {
    const query = new URLSearchParams({ page: String(page) });
    if (q) query.set('q', q);
    if (inactive) query.set('inactive', '1');
    return parseResponse(productListSchema, await apiRequest(`/products?${query.toString()}`));
  },
  async get(id: string): Promise<ProductDetail> {
    return detail(await apiRequest(`/products/${id}`));
  },
  async create(body: ProductCreate): Promise<ProductDetail> {
    return detail(await apiRequest('/products', { method: 'POST', body }));
  },
  async update(id: string, body: ProductUpdate): Promise<ProductDetail> {
    return detail(await apiRequest(`/products/${id}`, { method: 'PATCH', body }));
  },
  async addUnit(id: string, body: UnitCreate): Promise<ProductDetail> {
    return detail(await apiRequest(`/products/${id}/units`, { method: 'POST', body }));
  },
  async updateUnit(id: string, unitId: string, body: UnitUpdate): Promise<ProductDetail> {
    return detail(await apiRequest(`/products/${id}/units/${unitId}`, { method: 'PATCH', body }));
  },
  async setPrice(id: string, unitId: string, body: PriceSet): Promise<ProductDetail> {
    return detail(
      await apiRequest(`/products/${id}/units/${unitId}/prices`, { method: 'POST', body }),
    );
  },
};
