import {
  customerCreateSchema,
  customerMergeSchema,
  customerSearchQuerySchema,
  customerUpdateSchema,
  type Customer,
  type CustomerPurchases,
  type CustomerSearchResult,
  type Role,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requireRole } from '../plugins/session.js';
import { customerPurchases } from '../services/customer-purchases.js';
import {
  createCustomer,
  deactivateCustomer,
  findCustomer,
  mergeCustomer,
  searchCustomers,
  updateCustomer,
} from '../services/customers.js';

const paramsSchema = z.object({ id: z.uuid() });

/**
 * Annexe B, « Clients (répertoire) »: sales create and edit, the cashier and the manager edit,
 * the owner and the admin read; only the manager merges or deactivates (RG-DEV-04). The
 * warehouse has no access: phone numbers are personal data.
 */
const READERS: readonly Role[] = ['sales', 'cashier', 'manager', 'owner', 'admin'];
const EDITORS: readonly Role[] = ['sales', 'cashier', 'manager'];

export const customerRoutes: FastifyPluginAsync = async (app) => {
  const readers = { preHandler: requireRole(...READERS) };
  const editors = { preHandler: requireRole(...EDITORS) };
  const manager = { preHandler: requireRole('manager') };

  app.get('/customers', readers, async (request): Promise<CustomerSearchResult> => {
    const { q } = customerSearchQuerySchema.parse(request.query);
    return searchCustomers(app.db, q);
  });

  app.get('/customers/:id', readers, async (request): Promise<Customer> => {
    const { id } = paramsSchema.parse(request.params);
    return findCustomer(app.db, id);
  });

  /** The latest purchases, shown on the tablet once the customer is chosen (H47). */
  app.get('/customers/:id/purchases', readers, async (request): Promise<CustomerPurchases> => {
    const { id } = paramsSchema.parse(request.params);
    return customerPurchases(app.db, id);
  });

  app.post('/customers', { preHandler: requireRole('sales') }, async (request, reply) => {
    const body = customerCreateSchema.parse(request.body);
    const customer = await createCustomer(app.db, actorOf(authOf(request)), body);
    return reply.code(201).send(customer);
  });

  app.patch('/customers/:id', editors, async (request): Promise<Customer> => {
    const { id } = paramsSchema.parse(request.params);
    const body = customerUpdateSchema.parse(request.body);
    return updateCustomer(app.db, actorOf(authOf(request)), id, body);
  });

  app.post('/customers/:id/deactivate', manager, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await deactivateCustomer(app.db, actorOf(authOf(request)), id);
    return reply.code(204).send();
  });

  app.post('/customers/:id/merge', manager, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const { intoId } = customerMergeSchema.parse(request.body);
    await mergeCustomer(app.db, actorOf(authOf(request)), id, intoId);
    return reply.code(204).send();
  });
};
