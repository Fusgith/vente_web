import type { Dashboard, DashboardFigures } from '@vente-web/shared';

export const noFigures: DashboardFigures = {
  collected: '0.00',
  invoices: 0,
  averageBasket: '0.00',
  sales: '0.00',
  gross: '0.00',
  discounts: '0.00',
  discountsWithinCap: '0.00',
  discountsByRule: '0.00',
  discountsByCode: '0.00',
  creditNotes: 0,
  refunded: '0.00',
};

/** A dashboard without a sale, for the screens around it. */
export const emptyDashboard = (day: string): Dashboard => ({
  from: day,
  to: day,
  current: noFigures,
  previous: noFigures,
  weekBefore: noFigures,
  byMethod: [],
  bySalesperson: [],
  byHour: [],
  byDay: [],
  byCategory: [],
  topProducts: [],
  priceChanges: [],
});
