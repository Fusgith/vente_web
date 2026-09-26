import type { FastifyPluginAsync } from 'fastify';
import { SaveQuoteRequest, SavedQuoteResponse, computeQuote } from '@vente-web/shared';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { requireAuth, authOf } from '../plugins/session.js';

export const salesRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/sales/quotes',
    {
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const auth = authOf(request);
      const user = auth.user;
      const data = SaveQuoteRequest.parse(request.body);
      
      const productIds = data.lines.map((l: any) => l.productId);
      const unitIds = data.lines.map((l: any) => l.productUnitId);
      
      const products = await app.db.product.findMany({
        where: { id: { in: productIds } },
        include: { units: { where: { id: { in: unitIds } } } },
      });

      const quote = computeQuote({
        lines: data.lines.map((l: any) => ({
          quantity: l.qty,
          unitPrice: l.unitPrice,
          capPct: l.capPct,
          discount: l.discount,
          granted: l.discount,
        })),
        orderDiscount: data.orderDiscount,
        orderGranted: data.orderDiscount,
      });

      const number = 'DEV-' + randomBytes(4).toString('hex').toUpperCase();

      const order = await app.db.order.create({
        data: {
          number,
          status: 'DRAFT',
          salesUserId: user.id,
          customerId: data.customerId,
          subtotal: quote.subtotal,
          orderDiscountPct: quote.orderDiscountPct ?? null,
          orderDiscountAmount: quote.orderDiscount,
          orderDiscountSource: data.orderDiscount ? 'WITHIN_CAP' : 'NONE',
          discountTotal: quote.discountTotal,
          total: quote.total,
          lines: {
            create: data.lines.map((l: any, i: number) => {
              const product = products.find((p) => p.id === l.productId)!;
              const unit = product.units.find((u) => u.id === l.productUnitId)!;
              const qtLine = quote.lines[i]!;
              return {
                position: i,
                productId: product.id,
                productUnitId: unit.id,
                sku: product.sku,
                name: product.name,
                unitLabel: unit.label,
                factor: unit.factor,
                qty: l.qty,
                baseQty: new Prisma.Decimal(l.qty).mul(unit.factor).toFixed(2),
                unitPrice: l.unitPrice,
                maxDiscountPct: l.capPct,
                discountPct: qtLine.discountPct,
                discountAmount: qtLine.discount,
                discountSource: l.discount ? 'WITHIN_CAP' : 'NONE',
                lineTotal: qtLine.net,
                orderDiscountShare: qtLine.orderDiscountShare,
              };
            }),
          },
        },
      });

      return reply.code(201).send({ id: order.id, number: order.number });
    }
  );
};
