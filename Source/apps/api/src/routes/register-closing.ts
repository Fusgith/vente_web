import { registerSessionCloseSchema, type Role, type SessionSummary } from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { AppError } from '../errors.js';
import { renderPdf } from '../pdf/render.js';
import { closingDocument } from '../pdf/templates/closing.js';
import { actorOf, authOf, requireRole } from '../plugins/session.js';
import {
  closeSession,
  currentSummary,
  sessionFor,
  sessionsOfDay,
} from '../services/register-closing.js';
import { readStoreLegal } from '../services/store-legal.js';

const idParams = z.object({ id: z.uuid() });
const dayQuery = z.object({ day: z.iso.date().optional() });

/** « cloture-caisse-1-2026-09-28.pdf »: ASCII only, as a header allows. */
function fileName(summary: SessionSummary): string {
  const name = summary.station.name
    .normalize('NFD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `cloture-${name}-${summary.openedAt.slice(0, 10)}.pdf`;
}

/** Annexe B « Session de caisse »: the cashier closes their own; the manager and owner read. */
const TAKERS: Role[] = ['cashier', 'manager'];
const READERS: Role[] = ['cashier', 'manager', 'owner'];

/** The register closing (T-054, RG-CAI-03 à 05, H35). */
export const registerClosingRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/register-sessions/current/summary',
    { preHandler: requireRole(...TAKERS) },
    async (request): Promise<{ summary: SessionSummary | null }> => ({
      summary: await currentSummary(app.db, authOf(request).user.id),
    }),
  );

  app.post(
    '/register-sessions/current/close',
    { preHandler: requireRole(...TAKERS) },
    async (request): Promise<SessionSummary> => {
      const body = registerSessionCloseSchema.parse(request.body);
      return closeSession(app.db, actorOf(authOf(request)), body);
    },
  );

  // The day's sessions, forgotten ones included (RG-CAI-04/05); the shop's day by default.
  app.get(
    '/register-sessions',
    { preHandler: requireRole('manager', 'owner') },
    async (request): Promise<{ sessions: SessionSummary[] }> => {
      const { day } = dayQuery.parse(request.query);
      // Noon UTC lies within the same calendar day at the shop (UTC+3).
      const at = day ? new Date(`${day}T12:00:00Z`) : new Date();
      if (Number.isNaN(at.getTime())) throw new AppError(400, 'BAD_REQUEST');
      return { sessions: await sessionsOfDay(app.db, at) };
    },
  );

  app.get(
    '/register-sessions/:id/report',
    { preHandler: requireRole(...READERS) },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const { summary, invoices } = await sessionFor(app.db, actorOf(authOf(request)), id);
      const pdf = await renderPdf(
        closingDocument({ legal: await readStoreLegal(app.db), summary, invoices }),
      );
      return reply
        .type('application/pdf')
        .header('content-disposition', `inline; filename="${fileName(summary)}"`)
        .header('cache-control', 'no-store')
        .send(pdf);
    },
  );
};
