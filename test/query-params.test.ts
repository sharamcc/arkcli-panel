import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import Fastify from 'fastify';

const originalCwd = process.cwd();
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arkcli-panel-query-'));
const accountsDir = path.join(tmpRoot, 'configs', 'accounts');
fs.mkdirSync(accountsDir, { recursive: true });
fs.writeFileSync(
  path.join(accountsDir, 'disabled-account.json'),
  `${JSON.stringify(
    {
      name: 'disabled-account',
      ak: 'AKTEST',
      sk: 'SKTEST',
      region: 'ap-southeast-1',
      enabled: false,
    },
    null,
    2,
  )}\n`,
);

// 路由模块在导入时按 process.cwd() 计算 ACCOUNTS_DIR，测试使用临时账户目录
process.chdir(tmpRoot);

const { usageRoutes } = await import('../src/routes/usage.js');
const { endpointRoutes } = await import('../src/routes/endpoints.js');
const { modelRoutes } = await import('../src/routes/models.js');
const app = Fastify();

await app.register(usageRoutes);
await app.register(endpointRoutes);
await app.register(modelRoutes);

after(async () => {
  await app.close();
  process.chdir(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const invalidAccountValues = [
  '..%2Fsettings',
  '%2e%2e%2fsettings',
  '..',
  '',
  'bad.name',
  'good-account%2Fextra',
  '..%5Csettings',
];

const routes = [
  (value: string) => `/api/usage?start=2026-10-28&end=2026-10-28&account=${value}`,
  (value: string) => `/api/endpoints?account=${value}`,
  (value: string) => `/api/models?account=${value}`,
];

test('/api/usage、/api/endpoints、/api/models 拒绝非法 account 查询参数', async () => {
  for (const route of routes) {
    for (const value of invalidAccountValues) {
      const res = await app.inject({ method: 'GET', url: route(value) });
      assert.equal(res.statusCode, 400, `${route(value)} 应返回 400`);

      const body = res.json() as { success?: boolean; code?: string };
      assert.equal(body.success, false);
      assert.equal(body.code, 'validation');
    }
  }
});

test('/api/usage 对不存在的 account 返回 404', async () => {
  const res = await app.inject({ method: 'GET', url: routes[0]('missing-account') });

  assert.equal(res.statusCode, 404);
  const body = res.json() as { success?: boolean; code?: string };
  assert.equal(body.success, false);
  assert.equal(body.code, 'account.not_found');
});

test('/api/usage 对已存在但停用的 account 返回 404 account.disabled', async () => {
  const res = await app.inject({ method: 'GET', url: routes[0]('disabled-account') });

  assert.equal(res.statusCode, 404);
  const body = res.json() as { success?: boolean; code?: string };
  assert.equal(body.success, false);
  assert.equal(body.code, 'account.disabled');
});

test('/api/endpoints、/api/models 对合法但无关的 account 保持 200 空数据', async () => {
  // 有意为之：列表接口把未知 account 当作空结果，不返回 404
  for (const route of routes.slice(1)) {
    const res = await app.inject({ method: 'GET', url: route('missing-account') });
    assert.equal(res.statusCode, 200, `${route('missing-account')} 应返回 200`);

    const body = res.json() as { success?: boolean; data?: unknown };
    assert.equal(body.success, true);
    assert.deepEqual(body.data, []);
  }
});
