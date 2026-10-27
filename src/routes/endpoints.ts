import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getEndpointsAcrossAccounts } from '../service/account-service.js';
import { getEndpoint } from '../ark/endpoint.js';
import { loadAccounts } from '../config/loader.js';
import { errorCodeOf } from '../types/errors.js';

const listQuerySchema = z.object({
  account: z.string().optional(),
  project: z.string().optional(),
  status: z.string().optional(),
  name: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
});

export async function endpointRoutes(app: FastifyInstance) {
  // 列表：可指定 account，否则聚合所有启用账户
  app.get('/api/endpoints', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, code: 'validation', error: parsed.error.flatten().fieldErrors });
    }
    const q = parsed.data;
    try {
      const data = await getEndpointsAcrossAccounts(
        {
          pageNumber: q.page,
          pageSize: q.pageSize,
          projectName: q.project,
          statuses: q.status ? [q.status as never] : undefined,
          name: q.name,
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

  // 详情：必须指定 account（因为 AK/SK 按账户隔离）
  app.get<{ Params: { id: string }; Querystring: { account: string } }>(
    '/api/endpoints/:id',
    async (request, reply) => {
      const { id } = request.params;
      const { account } = request.query;
      if (!account) {
        return reply
          .status(400)
          .send({ success: false, code: 'validation', error: 'query.account 必填' });
      }
      const acct = loadAccounts().find((a) => a.name === account);
      if (!acct) {
        return reply.status(404).send({
          success: false,
          code: 'account.not_found',
          error: `账户 "${account}" 不存在`,
        });
      }
      try {
        const data = await getEndpoint(acct, id);
        return { success: true, data };
      } catch (err) {
        return reply
          .status(500)
          .send({ success: false, code: errorCodeOf(err), error: (err as Error).message });
      }
    },
  );
}
