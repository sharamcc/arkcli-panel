import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import Fastify from 'fastify';

const originalCwd = process.cwd();
const originalFetch = globalThis.fetch;
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arkcli-panel-breakdown-routes-'));
const accountsDir = path.join(tmpRoot, 'configs', 'accounts');
fs.mkdirSync(accountsDir, { recursive: true });
fs.writeFileSync(
  path.join(accountsDir, 'bd-account.json'),
  `${JSON.stringify(
    {
      name: 'bd-account',
      ak: 'AKTEST',
      sk: 'SKTEST',
      project: 'bd-account',
      region: 'ap-southeast-1',
      enabled: true,
    },
    null,
    2,
  )}\n`,
);

process.chdir(tmpRoot);

const { usageBreakdownRoutes } = await import('../src/routes/usage-breakdown.js');
const app = Fastify();
await app.register(usageBreakdownRoutes);

after(async () => {
  globalThis.fetch = originalFetch;
  await app.close();
  process.chdir(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const baseQuery = 'start=2026-10-28&end=2026-10-28';

function arkResponse(result: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        ResponseMetadata: {
          RequestId: 'test',
          Action: 'test',
          Version: '2024-01-01',
          Service: 'ark',
          Region: 'ap-southeast-1',
        },
        Result: result,
      }),
  } as Response;
}

test('/api/usage/breakdown 缺失账户返回 404，不泄漏内部 message', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/usage/breakdown?account=missing-account&${baseQuery}`,
  });

  assert.equal(res.statusCode, 404);
  const body = res.json() as { code?: string; error?: string };
  assert.equal(body.code, 'account.not_found');
  assert.equal(body.error, '账户不存在');
});

test('/api/usage/breakdown 未知异常返回 500 internal，不泄漏原始 message', async () => {
  globalThis.fetch = (async () => {
    throw new Error('secret internal details');
  }) as typeof fetch;

  const res = await app.inject({
    method: 'GET',
    url: `/api/usage/breakdown?account=bd-account&${baseQuery}`,
  });

  assert.equal(res.statusCode, 500);
  const body = res.json() as { code?: string; error?: string };
  assert.equal(body.code, 'internal');
  assert.equal(body.error, '服务器内部错误');
  assert.equal(String(body.error).includes('secret internal details'), false);
});

test('/api/usage/breakdown fallback_limit 返回 400', async () => {
  const ids = Array.from({ length: 21 }, (_, index) => `ep-${index + 1}`);
  globalThis.fetch = (async (input) => {
    const action = new URL(String(input)).searchParams.get('Action');
    if (action === 'ListEndpoints') {
      return arkResponse({
        Items: ids.map((id) => ({
          Id: id,
          Name: `endpoint-${id}`,
          Status: 'Running',
          ProjectName: 'bd-account',
          EndpointModelType: 'FoundationModel',
          ModelReference: { FoundationModel: { Name: 'test-model', ModelVersion: '1' } },
          CreateTime: '2026-10-01T00:00:00Z',
          UpdateTime: '2026-10-01T00:00:00Z',
        })),
        TotalCount: ids.length,
        PageNumber: 1,
        PageSize: 100,
      });
    }
    return arkResponse({
      Fields: [
        { Name: 'Day', Type: 'DATE' },
        { Name: 'TotalTokens', Type: 'BIGINT' },
      ],
      Data: [],
      DataCount: 0,
    });
  }) as typeof fetch;

  const res = await app.inject({
    method: 'GET',
    url: `/api/usage/breakdown?account=bd-account&${baseQuery}`,
  });

  assert.equal(res.statusCode, 400);
  const body = res.json() as { code?: string; error?: string };
  assert.equal(body.code, 'breakdown.fallback_limit');
  assert.equal(body.error, '接入点数量过多，无法拆分');
});
