import {
  currentRegisterSessionSchema,
  paidOrderSchema,
  paymentMethodListSchema,
  registerSessionSchema,
  registerStationListSchema,
  type PaidOrder,
  type PaymentInput,
  type PaymentMethod,
  type RegisterSession,
  type RegisterSessionOpen,
  type RegisterStation,
} from '@vente-web/shared';
import { API_BASE, apiRequest, parseResponse } from './client.js';

/** The register session and the payment (T-051, RG-CAI-01/02, RG-PAY, H32). */
export const paymentsApi = {
  async methods(): Promise<PaymentMethod[]> {
    return parseResponse(paymentMethodListSchema, await apiRequest('/payment-methods')).methods;
  },

  /** The invoice as issued (RG-FAC-04), opened in a tab and printed from the browser. */
  invoicePdfUrl(invoiceId: string): string {
    return `${API_BASE}/invoices/${invoiceId}/pdf`;
  },

  async currentSession(): Promise<RegisterSession | null> {
    return parseResponse(
      currentRegisterSessionSchema,
      await apiRequest('/register-sessions/current'),
    ).session;
  },

  async registers(): Promise<RegisterStation[]> {
    return parseResponse(registerStationListSchema, await apiRequest('/register-sessions/stations'))
      .stations;
  },

  async openSession(input: RegisterSessionOpen): Promise<RegisterSession> {
    const data = await apiRequest('/register-sessions', { method: 'POST', body: input });
    return parseResponse(registerSessionSchema, data);
  },

  /**
   * The order at the register paid, over the version read. `key` stays the same for one payment
   * however many times it is sent: the API records it once.
   */
  async pay(orderId: string, input: PaymentInput, key: string): Promise<PaidOrder> {
    const data = await apiRequest(`/orders/${orderId}/pay`, {
      method: 'POST',
      body: input,
      headers: { 'idempotency-key': key },
    });
    return parseResponse(paidOrderSchema, data);
  },
};
