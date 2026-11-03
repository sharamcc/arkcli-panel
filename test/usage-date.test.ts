import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import Fastify from 'fastify';

const originalCwd = process.cwd();
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arkcli-panel-usage-date-'));
fs.mkdirSync(path.join(tmpRoot, 'configs', 'accounts'), { recursive: true });
process.chdir(tmpRoot);

const { usageRoutes } = await import('../src/routes/usage.js');
const app = Fastify();
await app.register(usageRoutes);

after(async () => {
  await app.close();
  process.chdir(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test('/api/usage 拒绝滚动日期和非法月份', async () => {
  for (const start of ['2026-02-30', '2026-02-31', '2026-13-01']) {
    const res = await app.inject({
      method: 'GET',
      url: `/api/usage?start=${start}&end=2026-03-02`,
    });
    assert.equal(res.statusCode, 400, start);
    assert.equal((res.json() as { code?: string }).code, 'usage.invalid_date');
  }
});

test('/api/usage 闰年 2/29 合法', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/usage?start=2028-02-29&end=2028-02-29',
  });
  assert.equal(res.statusCode, 200);
});

test('/api/usage 日模式 31 天通过，32 天拒绝', async () => {
  const ok = await app.inject({
    method: 'GET',
    url: '/api/usage?start=2026-01-01&end=2026-01-31',
  });
  assert.equal(ok.statusCode, 200);

  const tooLong = await app.inject({
    method: 'GET',
    url: '/api/usage?start=2026-01-01&end=2026-02-01',
  });
  assert.equal(tooLong.statusCode, 400);
  assert.equal((tooLong.json() as { code?: string }).code, 'usage.too_long');
});

test('/api/usage 小时模式 7 天通过，8 天拒绝', async () => {
  const ok = await app.inject({
    method: 'GET',
    url: '/api/usage?start=2026-01-01&end=2026-01-07&interval=Hour',
  });
  assert.equal(ok.statusCode, 200);

  const tooLong = await app.inject({
    method: 'GET',
    url: '/api/usage?start=2026-01-01&end=2026-01-08&interval=Hour',
  });
  assert.equal(tooLong.statusCode, 400);
  assert.equal((tooLong.json() as { code?: string }).code, 'usage.hour_too_long');
});
