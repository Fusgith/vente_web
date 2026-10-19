import {
  discountRuleInputSchema,
  draftSuggestedInputSchema,
  type DiscountRule,
  type DiscountRuleList,
  type DraftSuggested,
  type SuggestedDiscounts,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { AppError } from '../errors.js';
import { actorOf, authOf, requirePermission } from '../plugins/session.js';
import {
  createDiscountRule,
  listDiscountRules,
  suggestedFor,
  suggestedOn,
  updateDiscountRule,
} from '../services/discount-rules.js';
import { findOrder } from '../services/order-view.js';

const params = z.object({ id: z.uuid() });
/** H62, annexe B: the owner sets the rules; who applies or checks them reads them. */
const readers = { preHandler: requirePermission('discountRules.read') };
const owner = { preHandler: requirePermission('discountRules.edit') };

/** The owner's discount rules (T-090, H62): suggested discounts the register applies (H61). */
export const discountRuleRoutes: FastifyPluginAsync = async (app) => {
  app.get('/discount-rules', readers, async (): Promise<DiscountRuleList> => ({
    items: await listDiscountRules(app.db),
  }));

  /** What the rules suggest today on each line of an order, as it stands (H62). */
  app.get(
    '/orders/:id/suggested-discounts',
    readers,
    async (request): Promise<SuggestedDiscounts> => {
      const { id } = params.parse(request.params);
      const order = await findOrder(app.db, id);
      if (!order) throw new AppError(404, 'NOT_FOUND');
      const pcts = await suggestedOn(app.db, order);
      return {
        version: order.version,
        lines: order.lines.map((line, index) => ({
          position: line.position,
          pct: pcts[index] ?? null,
        })),
      };
    },
  );

  /** What the rules suggest on the tablet's draft, not saved yet (H62). */
  app.post('/suggested-discounts', readers, async (request): Promise<DraftSuggested> => {
    const input = draftSuggestedInputSchema.parse(request.body);
    const units = await app.db.productUnit.findMany({
      where: { id: { in: input.lines.map((line) => line.productUnitId) } },
      select: { id: true, productId: true, factor: true },
    });
    const byId = new Map(units.map((unit) => [unit.id, unit]));
    const lines = input.lines.flatMap((line) => {
      const unit = byId.get(line.productUnitId);
      return unit
        ? [{ productId: unit.productId, qty: line.qty, factor: unit.factor.toFixed() }]
        : [];
    });
    if (lines.length !== input.lines.length) throw new AppError(404, 'NOT_FOUND');
    if (!(await app.db.customer.count({ where: { id: input.customerId } }))) {
      throw new AppError(404, 'NOT_FOUND');
    }
    return { lines: await suggestedFor(app.db, input.customerId, lines) };
  });

  app.post('/discount-rules', owner, async (request, reply): Promise<DiscountRule> => {
    const input = discountRuleInputSchema.parse(request.body);
    return reply.code(201).send(await createDiscountRule(app.db, actorOf(authOf(request)), input));
  });

  app.put('/discount-rules/:id', owner, async (request): Promise<DiscountRule> => {
    const { id } = params.parse(request.params);
    const input = discountRuleInputSchema.parse(request.body);
    return updateDiscountRule(app.db, actorOf(authOf(request)), id, input);
  });
};
