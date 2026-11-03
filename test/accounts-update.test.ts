import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import Fastify from 'fastify';

const originalCwd = process.cwd();
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arkcli-panel-update-'));
const accountsDir = path.join(tmpRoot, 'configs', 'accounts');
fs.mkdirSync(accountsDir, { recursive: true });

const base = {
  ak: 'AKTEST',
  sk: 'SKTEST',
  region: 'ap-southeast-1',
  enabled: true,
};

fs.writeFileSync(
  path.join(accountsDir, 'clear-account.json'),
  `${JSON.stringify(
    {
      ...base,
      name: 'clear-account',
      label: 'Old label',
      note: 'Old note',
      project: 'old-project',
    },
    null,
    2,
  )}\n`,
);
fs.writeFileSync(
  path.join(accountsDir, 'keep-account.json'),
  `${JSON.stringify(
    {
      ...base,
      name: 'keep-account',
      label: 'Keep label',
      note: 'Keep note',
      project: 'keep-project',
    },
    null,
    2,
  )}\n`,
);
fs.writeFileSync(
  path.join(accountsDir, 'legacy-account.json'),
  `${JSON.stringify({ ...base, name: 'legacy-account', project: '' }, null, 2)}\n`,
);

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

test('编辑账户时 label/note/project 空串会真正清空', async () => {
  const res = await app.inject({
    method: 'PUT',
    url: '/api/accounts/clear-account',
    payload: { label: '', note: '', project: '' },
  });

  assert.equal(res.statusCode, 200);
  const raw = JSON.parse(
    fs.readFileSync(path.join(accountsDir, 'clear-account.json'), 'utf-8'),
  ) as Record<string, unknown>;
  assert.equal(raw.label, '');
  assert.equal(raw.note, '');
  assert.equal('project' in raw, false);

  const account = loader.getAccount('clear-account');
  assert.ok(account);
  assert.equal(account.label, '');
  assert.equal(account.note, '');
  assert.equal(account.project, undefined);
  assert.equal(loader.projectNameOf(account), 'clear-account');
  assert.equal(loader.toAccountView(account).project, 'clear-account');
});

test('未提交的字段保持原值', async () => {
  const res = await app.inject({
    method: 'PUT',
    url: '/api/accounts/keep-account',
    payload: { label: 'New label' },
  });

  assert.equal(res.statusCode, 200);
  const raw = JSON.parse(
    fs.readFileSync(path.join(accountsDir, 'keep-account.json'), 'utf-8'),
  ) as Record<string, unknown>;
  assert.equal(raw.label, 'New label');
  assert.equal(raw.note, 'Keep note');
  assert.equal(raw.project, 'keep-project');

  const account = loader.getAccount('keep-account');
  assert.ok(account);
  assert.equal(account.label, 'New label');
  assert.equal(account.note, 'Keep note');
  assert.equal(account.project, 'keep-project');
});

test('旧配置中的空 project 读取后归一为账户名', () => {
  const account = loader.getAccount('legacy-account');
  assert.ok(account);
  assert.equal(account.project, undefined);
  assert.equal(loader.projectNameOf(account), 'legacy-account');
  assert.equal(loader.toAccountView(account).project, 'legacy-account');
});
