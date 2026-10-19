import {
  priceSetSchema,
  productCreateSchema,
  productListQuerySchema,
  productUpdateSchema,
  unitCreateSchema,
  unitUpdateSchema,
  type ProductDetail,
  type ProductList,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requirePermission } from '../plugins/session.js';
import {
  addUnit,
  changePrice,
  createProduct,
  listProducts,
  loadProduct,
  updateProduct,
  updateUnit,
} from '../services/products.js';

const productParams = z.object({ id: z.uuid() });
const unitParams = z.object({ id: z.uuid(), unitId: z.uuid() });

/** Annexe B (H65): the manager and the owner create and change products; the admin reads. */

/** Products, sale units and dated prices on screen (T-092, T-019, T-019b). */
export const productRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/products',
    { preHandler: requirePermission('products.read') },
    async (request): Promise<ProductList> =>
      listProducts(app.db, productListQuerySchema.parse(request.query)),
  );

  app.get(
    '/products/:id',
    { preHandler: requirePermission('products.read') },
    async (request): Promise<ProductDetail> =>
      loadProduct(app.db, productParams.parse(request.params).id),
  );

  app.post(
    '/products',
    { preHandler: requirePermission('products.edit') },
    async (request, reply) => {
      const body = productCreateSchema.parse(request.body);
      const id = await createProduct(app.db, actorOf(authOf(request)), body);
      return reply.code(201).send(await loadProduct(app.db, id));
    },
  );

  app.patch(
    '/products/:id',
    { preHandler: requirePermission('products.edit') },
    async (request): Promise<ProductDetail> => {
      const { id } = productParams.parse(request.params);
      await updateProduct(
        app.db,
        actorOf(authOf(request)),
        id,
        productUpdateSchema.parse(request.body),
      );
      return loadProduct(app.db, id);
    },
  );

  app.post(
    '/products/:id/units',
    { preHandler: requirePermission('products.edit') },
    async (request, reply) => {
      const { id } = productParams.parse(request.params);
      await addUnit(app.db, actorOf(authOf(request)), id, unitCreateSchema.parse(request.body));
      return reply.code(201).send(await loadProduct(app.db, id));
    },
  );

  app.patch(
    '/products/:id/units/:unitId',
    { preHandler: requirePermission('products.edit') },
    async (request): Promise<ProductDetail> => {
      const { id, unitId } = unitParams.parse(request.params);
      await updateUnit(
        app.db,
        actorOf(authOf(request)),
        id,
        unitId,
        unitUpdateSchema.parse(request.body),
      );
      return loadProduct(app.db, id);
    },
  );

  app.post(
    '/products/:id/units/:unitId/prices',
    { preHandler: requirePermission('products.edit') },
    async (request): Promise<ProductDetail> => {
      const { id, unitId } = unitParams.parse(request.params);
      await changePrice(
        app.db,
        actorOf(authOf(request)),
        id,
        unitId,
        priceSetSchema.parse(request.body),
      );
      return loadProduct(app.db, id);
    },
  );
};
