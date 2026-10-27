import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getUsageAcrossAccounts } from '../service/account-service.js';
import { QueryInterval } from '../ark/usage.js';
import { errorCodeOf } from '../types/errors.js';

const querySchema = z.object({
  account: z.string().optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start 须为 YYYY-MM-DD'),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end 须为 YYYY-MM-DD'),
  interval: z.enum(['Hour', 'Day']).default('Day'),
  project: z.string().optional(),
});

export async function usageRoutes(app: FastifyInstance) {
  app.get('/api/usage', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, code: 'validation', error: parsed.error.flatten().fieldErrors });
    }
    const q = parsed.data;

    // Ark 限制查询区间必须小于 31 天
    const startMs = Date.parse(`${q.start}T00:00:00Z`);
    const endMs = Date.parse(`${q.end}T00:00:00Z`);
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
      return reply
        .status(400)
        .send({ success: false, code: 'usage.invalid_range', error: '结束日期不能早于开始日期' });
    }
    const days = Math.round((endMs - startMs) / 86_400_000);
    if (days > 30) {
      return reply.status(400).send({
        success: false,
        code: 'usage.too_long',
        error: 'Ark 限制查询区间必须小于 31 天，请缩短日期范围',
      });
    }

    try {
      const data = await getUsageAcrossAccounts(
        {
          startDate: q.start,
          endDate: q.end,
          interval: q.interval as QueryInterval,
          projectName: q.project,
        },
        q.account,
      );
      return { success: true, data };
    } catch (err) {
      return reply
        .status(500)
        .send({ success: false, code: errorCodeOf(err), error: (err as Error).message });
    }
  });
}
