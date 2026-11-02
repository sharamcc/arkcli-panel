import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import Fastify from 'fastify';

const originalCwd = process.cwd();
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arkcli-panel-accounts-'));
const configsDir = path.join(tmpRoot, 'configs');
const accountsDir = path.join(configsDir, 'accounts');
const settingsPath = path.join(configsDir, 'settings.json');
const readmePath = path.join(tmpRoot, 'README.md');
const settingsContent = '{"lang":"zh"}\n';
const readmeContent = '# sentinel\n';

fs.mkdirSync(accountsDir, { recursive: true });
fs.writeFileSync(settingsPath, settingsContent, 'utf-8');
fs.writeFileSync(readmePath, readmeContent, 'utf-8');

const goodAccount = {
  name: 'good-account',
  label: 'Good',
  ak: 'AKTEST',
  sk: 'SKTEST',
  project: 'good-account',
  region: 'ap-southeast-1',
  enabled: true,
};
const goodPath = path.join(accountsDir, 'good-account.json');
fs.writeFileSync(goodPath, `${JSON.stringify(goodAccount, null, 2)}\n`, 'utf-8');

// loader 在导入时按 process.cwd() 计算 ACCOUNTS_DIR，测试必须先切到临时目录
process.chdir(tmpRoot);

const { accountRoutes } = await import('../src/routes/accounts.js');
const loader = await import('../src/config/loader.js');
const app = Fastify();

await app.register(accountRoutes);

after(async () => {
  await app.close();
  process.chdir(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const invalidAccountUrls = [
  '/api/accounts/..%2Fsettings',
  '/api/accounts/..%2F..%2FREADME',
  '/api/accounts/%2e%2e%2fsettings',
  '/api/accounts/%2E%2E%2F%2E%2E%2FREADME',
  '/api/accounts/good-account%2Fextra',
  '/api/accounts/..%5Csettings',
  '/api/accounts/good.account',
  '/api/accounts/%252e%252e%252fsettings',
];

function assertInvalidEnvelope(body: unknown): void {
  const payload = body as { success?: boolean; code?: string };
  assert.equal(payload.success, false);
  assert.equal(payload.code, 'validation');
}

test('DELETE 及同类 :name 路由拒绝路径穿越，目录外文件保持不变', async () => {
  const accountsBefore = fs.readdirSync(accountsDir).sort();

  for (const url of invalidAccountUrls) {
    for (const method of ['DELETE', 'PUT'] as const) {
      const res = await app.inject({
        method,
        url,
        ...(method === 'PUT'
          ? {
              payload: JSON.stringify({ label: 'changed' }),
              headers: { 'content-type': 'application/json' },
            }
          : {}),
      });
      assert.equal(res.statusCode, 400, `${method} ${url} 应返回 400`);
      assertInvalidEnvelope(res.json());
    }

    const verify = await app.inject({ method: 'GET', url: `${url}/verify` });
    assert.equal(verify.statusCode, 400, `GET ${url}/verify 应返回 400`);
    assertInvalidEnvelope(verify.json());

    assert.equal(fs.existsSync(settingsPath), true);
    assert.equal(fs.readFileSync(settingsPath, 'utf-8'), settingsContent);
    assert.equal(fs.existsSync(readmePath), true);
    assert.equal(fs.readFileSync(readmePath, 'utf-8'), readmeContent);
    assert.deepEqual(fs.readdirSync(accountsDir).sort(), accountsBefore);
  }
});

test('DELETE 合法账户仍然成功', async () => {
  const res = await app.inject({ method: 'DELETE', url: '/api/accounts/good-account' });

  assert.equal(res.statusCode, 200);
  assert.equal((res.json() as { success: boolean }).success, true);
  assert.equal(fs.existsSync(goodPath), false);
  assert.equal(fs.readFileSync(settingsPath, 'utf-8'), settingsContent);
  assert.equal(fs.readFileSync(readmePath, 'utf-8'), readmeContent);
});

test('loader 对非法账户名抛稳定错误码，且不触碰目录外文件', () => {
  assert.equal(fs.realpathSync(loader.ACCOUNTS_DIR), fs.realpathSync(accountsDir));

  const assertInvalidName = (fn: () => unknown) => {
    assert.throws(fn, (err: unknown) => {
      return (
        err instanceof Error && (err as Error & { code?: string }).code === 'account.invalid_name'
      );
    });
  };

  assertInvalidName(() => loader.accountExists('../settings'));
  assertInvalidName(() => loader.deleteAccountFile('../settings'));
  assertInvalidName(() =>
    loader.writeAccount({
      ...goodAccount,
      name: '../../README',
    }),
  );

  assert.equal(fs.existsSync(settingsPath), true);
  assert.equal(fs.readFileSync(settingsPath, 'utf-8'), settingsContent);
  assert.equal(fs.existsSync(readmePath), true);
  assert.equal(fs.readFileSync(readmePath, 'utf-8'), readmeContent);
});
