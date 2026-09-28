import {
  invoiceLookupSchema,
  refundedOrderSchema,
  type InvoiceLookup,
  type OrderRefund,
  type RefundedOrder,
} from '@vente-web/shared';

import { API_BASE, apiRequest, parseResponse } from './client.js';

/** Cancelling a paid sale: its refund and credit note (T-053, RG-ANN-02, ⚠️ H36). */
export const creditNotesApi = {
  /** The sale behind an invoice number, as the customer shows it. */
  async lookup(number: string): Promise<InvoiceLookup> {
    const data = await apiRequest(`/invoices/lookup?number=${encodeURIComponent(number)}`);
    return parseResponse(invoiceLookupSchema, data);
  },

  async refund(orderId: string, input: OrderRefund): Promise<RefundedOrder> {
    const data = await apiRequest(`/orders/${orderId}/refund`, { method: 'POST', body: input });
    return parseResponse(refundedOrderSchema, data);
  },

  /** The credit note as issued (RG-FAC-05), opened in a tab and printed from the browser. */
  pdfUrl(creditNoteId: string): string {
    return `${API_BASE}/credit-notes/${creditNoteId}/pdf`;
  },
};
