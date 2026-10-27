import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getModelsAcrossAccounts } from '../service/account-service.js';

const querySchema = z.object({
  account: z.string().optional(),
  name: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
  sortBy: z.enum(['CreateTime', 'UpdateTime']).optional(),
  sortOrder: z.enum(['Asc', 'Desc']).optional(),
});

export async function modelRoutes(app: FastifyInstance) {
  app.get('/api/models', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.flatten().fieldErrors });
    }
    const q = parsed.data;
    try {
      const data = await getModelsAcrossAccounts(
        {
          pageNumber: q.page,
          pageSize: q.pageSize,
          name: q.name,
          sortBy: q.sortBy,
          sortOrder: q.sortOrder,
        },
        q.account,
      );
      return { success: true, data };
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message });
    }
  });
}
