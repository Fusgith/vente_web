import type { FastifyPluginAsync } from 'fastify';
import { CreateCustomerRequest, CustomerSchema, SearchCustomersRequest } from '@vente-web/shared';

export const customerRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/customers',
    async (request, reply) => {
      const { name, phone, notes } = CreateCustomerRequest.parse(request.body);
      const customer = await app.db.customer.create({
        data: { name, phone, notes },
      });
      return reply.code(201).send(customer);
    }
  );

  app.get(
    '/customers',
    async (request) => {
      const { q } = SearchCustomersRequest.parse(request.query);
      const customers = await app.db.customer.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
          ],
          isActive: true,
        },
        take: 20,
      });
      return customers;
    }
  );
};
