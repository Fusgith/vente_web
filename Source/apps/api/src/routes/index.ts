import type { FastifyPluginAsync } from 'fastify';

import type { Env } from '../env.js';
import { authCredentialRoutes } from './auth-credentials.js';
import { authRoutes } from './auth.js';
import { catalogRoutes } from './catalog.js';
import { creditNoteRoutes } from './credit-notes.js';
import { customerRoutes } from './customers.js';
import { discountCapRoutes } from './discount-caps.js';
import { discountCodeRoutes } from './discount-codes.js';
import { discountRequestRoutes } from './discount-requests.js';
import { deliveryRoutes } from './deliveries.js';
import { orderRoutes } from './orders.js';
import { paymentRoutes } from './payments.js';
import { queueRoutes } from './queues.js';
import { quoteRoutes } from './quotes.js';
import { registerClosingRoutes } from './register-closing.js';
import { stockRoutes } from './stock.js';
import { supervisionRoutes } from './supervision.js';
import { userRoutes } from './users.js';

/** Everything under `/api/v1` (CDC technique section 6); `/healthz` stays at the root. */
export const apiRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  await app.register(authRoutes, { env });
  await app.register(authCredentialRoutes, { env });
  await app.register(userRoutes);
  await app.register(catalogRoutes);
  await app.register(customerRoutes);
  await app.register(quoteRoutes);
  await app.register(orderRoutes);
  await app.register(queueRoutes);
  await app.register(paymentRoutes, { env });
  await app.register(deliveryRoutes);
  await app.register(registerClosingRoutes);
  await app.register(creditNoteRoutes, { env });
  await app.register(supervisionRoutes);
  await app.register(stockRoutes);
  await app.register(discountCapRoutes);
  await app.register(discountCodeRoutes);
  await app.register(discountRequestRoutes);
};
