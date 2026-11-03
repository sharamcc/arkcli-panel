import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getAccount } from '../config/loader.js';
import { getUsageAcrossAccounts } from '../service/account-service.js';
import { AccountNameSchema } from '../types/account.js';
import { QueryInterval } from '../ark/usage.js';
import { errorCodeOf } from '../types/errors.js';
import { parseDateRange } from '../utils/date-range.js';

const querySchema = z.object({
  account: AccountNameSchema.optional(),
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

    // 日期必须真实存在，且日/小时模式分别受 31 天、7 天跨度限制
    const range = parseDateRange(q.start, q.end, q.interval);
    if (!range.ok) {
      return reply.status(400).send({ success: false, code: range.code, error: range.message });
    }

    const account = q.account ? getAccount(q.account) : undefined;
    if (q.account && !account) {
      return reply.status(404).send({
        success: false,
        code: 'account.not_found',
        error: `账户 "${q.account}" 不存在`,
      });
    }
    if (account && !account.enabled) {
      return reply.status(404).send({
        success: false,
        code: 'account.disabled',
        error: `账户 "${account.name}" 已停用`,
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
