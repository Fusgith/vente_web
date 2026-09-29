import {
  productStockSchema,
  stockAlertsSchema,
  type ProductStock,
  type StockAdjustment,
  type StockAlert,
} from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

/** Stock adjustments and alerts (T-023, RG-STK-05 à 07). */
export const stockApi = {
  async alerts(): Promise<StockAlert[]> {
    return (await parseResponse(stockAlertsSchema, await apiRequest('/stock/alerts'))).items;
  },
  async of(productId: string): Promise<ProductStock> {
    return parseResponse(productStockSchema, await apiRequest(`/products/${productId}/stock`));
  },
  async adjust(productId: string, adjustment: StockAdjustment): Promise<ProductStock> {
    return parseResponse(
      productStockSchema,
      await apiRequest(`/products/${productId}/stock/adjustments`, {
        method: 'POST',
        body: adjustment,
      }),
    );
  },
};
