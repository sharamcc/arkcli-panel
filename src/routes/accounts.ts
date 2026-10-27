import { FastifyInstance } from 'fastify';
import { accountExists, deleteAccountFile, getAccount, writeAccount } from '../config/loader.js';
import { listAccountViews } from '../service/account-service.js';
import { CreateAccountSchema, UpdateAccountSchema } from '../types/account.js';
import { listEndpoints } from '../ark/endpoint.js';

export async function accountRoutes(app: FastifyInstance) {
  // 账户列表（含停用账户，仅脱敏信息）
  app.get('/api/accounts', async () => {
    return { success: true, data: listAccountViews() };
  });

  // 新建账户
  app.post('/api/accounts', async (request, reply) => {
    const parsed = CreateAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.flatten().fieldErrors });
    }
    const input = parsed.data;
    if (accountExists(input.name)) {
      return reply.status(409).send({ success: false, error: `账户 "${input.name}" 已存在` });
    }
    writeAccount({
      name: input.name,
      label: input.label,
      ak: input.ak,
      sk: input.sk,
      project: input.project || undefined,
      region: input.region || 'ap-southeast-1',
      enabled: input.enabled ?? true,
      note: input.note,
    });
    return { success: true, data: { name: input.name } };
  });

  // 更新账户：name 不可改；ak/sk 留空表示保持原值
  app.put<{ Params: { name: string } }>('/api/accounts/:name', async (request, reply) => {
    const { name } = request.params;
    const existing = getAccount(name);
    if (!existing) {
      return reply.status(404).send({ success: false, error: `账户 "${name}" 不存在` });
    }
    const parsed = UpdateAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.flatten().fieldErrors });
    }
    const input = parsed.data;
    writeAccount({
      name,
      label: input.label ?? existing.label,
      ak: input.ak ? input.ak : existing.ak,
      sk: input.sk ? input.sk : existing.sk,
      project: input.project !== undefined ? input.project || undefined : existing.project,
      region: input.region || existing.region,
      enabled: input.enabled ?? existing.enabled,
      note: input.note !== undefined ? input.note : existing.note,
    });
    return { success: true, data: { name } };
  });

  // 删除账户
  app.delete<{ Params: { name: string } }>('/api/accounts/:name', async (request, reply) => {
    const { name } = request.params;
    if (!deleteAccountFile(name)) {
      return reply.status(404).send({ success: false, error: `账户 "${name}" 不存在` });
    }
    return { success: true, data: { name } };
  });

  // 验证凭证与项目权限：用 ListEndpoints(PageSize=1) 探测，不消耗 token
  app.get<{ Params: { name: string } }>('/api/accounts/:name/verify', async (request, reply) => {
    const { name } = request.params;
    const account = getAccount(name);
    if (!account) {
      return reply.status(404).send({ success: false, error: `账户 "${name}" 不存在` });
    }
    try {
      // 必须带上项目名：授权是按项目授予的，不传会落到 project/* 被拒
      const project = account.project ?? account.name;
      const result = await listEndpoints(account, { pageSize: 1, projectName: project });
      return {
        success: true,
        data: { ok: true, project, total: result.total },
      };
    } catch (err) {
      return {
        success: true,
        data: {
          ok: false,
          project: account.project ?? account.name,
          error: (err as Error).message,
        },
      };
    }
  });
}
