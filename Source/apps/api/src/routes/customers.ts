import {
  customerCategoryBodySchema,
  customerCreateSchema,
  customerMergeSchema,
  customerSearchQuerySchema,
  customerTypeBodySchema,
  customerUpdateSchema,
  type Customer,
  type CustomerCategories,
  type CustomerPurchases,
  type CustomerSearchResult,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requirePermission } from '../plugins/session.js';
import { customerPurchases } from '../services/customer-purchases.js';
import {
  createCustomer,
  customerCategories,
  deactivateCustomer,
  findCustomer,
  mergeCustomer,
  searchCustomers,
  setCustomerCategory,
  setCustomerType,
  updateCustomer,
} from '../services/customers.js';

const paramsSchema = z.object({ id: z.uuid() });

/**
 * Annexe B, « Clients (répertoire) »: sales create and edit, the cashier and the manager edit,
 * the owner and the admin read; only the manager merges or deactivates (RG-DEV-04). The
 * warehouse has no access: phone numbers are personal data.
 */

export const customerRoutes: FastifyPluginAsync = async (app) => {
  const readers = { preHandler: requirePermission('customers.read') };
  const editors = { preHandler: requirePermission('customers.edit') };
  const manager = { preHandler: requirePermission('customers.manage') };
  const typeSetters = { preHandler: requirePermission('customers.type') };

  app.get('/customers', readers, async (request): Promise<CustomerSearchResult> => {
    const { q, category } = customerSearchQuerySchema.parse(request.query);
    return searchCustomers(app.db, q ?? '', category);
  });

  /** The shop's categories (H49 a): a filter of the directory, a choice for the manager. */
  app.get('/customers/categories', readers, async (): Promise<CustomerCategories> => ({
    categories: await customerCategories(app.db),
  }));

  app.get('/customers/:id', readers, async (request): Promise<Customer> => {
    const { id } = paramsSchema.parse(request.params);
    return findCustomer(app.db, id);
  });

  /** The latest purchases, shown on the tablet once the customer is chosen (H47). */
  app.get('/customers/:id/purchases', readers, async (request): Promise<CustomerPurchases> => {
    const { id } = paramsSchema.parse(request.params);
    return customerPurchases(app.db, id);
  });

  app.post(
    '/customers',
    { preHandler: requirePermission('customers.create') },
    async (request, reply) => {
      const body = customerCreateSchema.parse(request.body);
      const customer = await createCustomer(app.db, actorOf(authOf(request)), body);
      return reply.code(201).send(customer);
    },
  );

  app.patch('/customers/:id', editors, async (request): Promise<Customer> => {
    const { id } = paramsSchema.parse(request.params);
    const body = customerUpdateSchema.parse(request.body);
    return updateCustomer(app.db, actorOf(authOf(request)), id, body);
  });

  /** Only the manager classes a customer (H49 a). */
  app.post('/customers/:id/category', manager, async (request): Promise<Customer> => {
    const { id } = paramsSchema.parse(request.params);
    const { category } = customerCategoryBodySchema.parse(request.body);
    return setCustomerCategory(app.db, actorOf(authOf(request)), id, category);
  });

  /** The manager or the owner sets the type, which sets the prices (H66, annexe B). */
  app.post('/customers/:id/type', typeSetters, async (request): Promise<Customer> => {
    const { id } = paramsSchema.parse(request.params);
    const { type } = customerTypeBodySchema.parse(request.body);
    return setCustomerType(app.db, actorOf(authOf(request)), id, type);
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
