import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getUsageBreakdown } from '../service/breakdown-service.js';
import { AccountNameSchema } from '../types/account.js';
import { QueryInterval } from '../ark/usage.js';
import { errorCodeOf } from '../types/errors.js';
import { parseDateRange } from '../utils/date-range.js';

const querySchema = z.object({
  account: AccountNameSchema,
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start 须为 YYYY-MM-DD'),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end 须为 YYYY-MM-DD'),
  interval: z.enum(['Hour', 'Day']).default('Day'),
});

export async function usageBreakdownRoutes(app: FastifyInstance) {
  app.get('/api/usage/breakdown', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, code: 'validation', error: parsed.error.flatten().fieldErrors });
    }
    const q = parsed.data;

    const range = parseDateRange(q.start, q.end, q.interval);
    if (!range.ok) {
      return reply.status(400).send({ success: false, code: range.code, error: range.message });
    }

    try {
      const data = await getUsageBreakdown(q.account, {
        startDate: q.start,
        endDate: q.end,
        interval: q.interval as QueryInterval,
      });
      return { success: true, data };
    } catch (err) {
      const code = errorCodeOf(err);
      if (code === 'account.not_found') {
        return reply.status(404).send({ success: false, code, error: '账户不存在' });
      }
      if (code === 'breakdown.fallback_limit') {
        return reply.status(400).send({ success: false, code, error: '接入点数量过多，无法拆分' });
      }
      return reply.status(500).send({ success: false, code: 'internal', error: '服务器内部错误' });
    }
  });
}
