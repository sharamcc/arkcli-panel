import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getUsageBreakdown } from '../service/breakdown-service.js';
import { QueryInterval } from '../ark/usage.js';

const querySchema = z.object({
  account: z.string().min(1, 'account 必填'),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start 须为 YYYY-MM-DD'),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end 须为 YYYY-MM-DD'),
  interval: z.enum(['Hour', 'Day']).default('Day'),
});

export async function usageBreakdownRoutes(app: FastifyInstance) {
  app.get('/api/usage/breakdown', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.flatten().fieldErrors });
    }
    const q = parsed.data;

    const startMs = Date.parse(`${q.start}T00:00:00Z`);
    const endMs = Date.parse(`${q.end}T00:00:00Z`);
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
      return reply.status(400).send({ success: false, error: '结束日期不能早于开始日期' });
    }
    if (Math.round((endMs - startMs) / 86_400_000) > 30) {
      return reply
        .status(400)
        .send({ success: false, error: 'Ark 限制查询区间必须小于 31 天，请缩短日期范围' });
    }

    try {
      const data = await getUsageBreakdown(q.account, {
        startDate: q.start,
        endDate: q.end,
        interval: q.interval as QueryInterval,
      });
      return { success: true, data };
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message });
    }
  });
}
