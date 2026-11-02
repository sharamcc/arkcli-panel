import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const originalCwd = process.cwd();
const originalFetch = globalThis.fetch;
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arkcli-panel-aggregation-'));
const accountsDir = path.join(tmpRoot, 'configs', 'accounts');
fs.mkdirSync(accountsDir, { recursive: true });

for (let index = 1; index <= 7; index += 1) {
  const name = `acct-${index}`;
  fs.writeFileSync(
    path.join(accountsDir, `${name}.json`),
    `${JSON.stringify(
      {
        name,
        ak: 'AKTEST',
        sk: 'SKTEST',
        project: name,
        region: 'ap-southeast-1',
        enabled: true,
      },
      null,
      2,
    )}\n`,
  );
}

process.chdir(tmpRoot);

const { getUsageAcrossAccounts } = await import('../src/service/account-service.js');

after(() => {
  globalThis.fetch = originalFetch;
  process.chdir(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function usageResponse(): Response {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        ResponseMetadata: {
          RequestId: 'test-request',
          Action: 'GetInferenceUsage',
          Version: '2024-01-01',
          Service: 'ark',
          Region: 'ap-southeast-1',
        },
        Result: {
          Fields: [
            { Name: 'Day', Type: 'DATE' },
            { Name: 'TotalTokens', Type: 'BIGINT' },
          ],
          Data: [['2026-10-28', 10]],
          DataCount: 1,
        },
      }),
  } as Response;
}

test('单账户超时只影响自己，聚合并发不超过 5', async () => {
  let active = 0;
  let maxActive = 0;
  let calls = 0;

  globalThis.fetch = (async (_input, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body ?? '{}')) as { ProjectName?: string };
    active += 1;
    maxActive = Math.max(maxActive, active);
    try {
      if (body.ProjectName === 'acct-1') {
        await new Promise((resolve) => setTimeout(resolve, 5));
        const err = new Error('simulated timeout');
        err.name = 'TimeoutError';
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      return usageResponse();
    } finally {
      active -= 1;
    }
  }) as typeof fetch;

  const results = await getUsageAcrossAccounts({
    startDate: '2026-10-28',
    endDate: '2026-10-28',
    interval: 'Day',
  });

  assert.equal(calls, 7);
  assert.equal(maxActive, 5);

  const failed = results.find((item) => item.account === 'acct-1');
  assert.ok(failed?.error?.includes('请求超时'));
  assert.equal(failed?.usage, null);

  for (const item of results.filter((result) => result.account !== 'acct-1')) {
    assert.equal(item.error, null);
    assert.equal(item.usage?.length, 1);
    assert.equal(item.usage?.[0].TotalTokens, 10);
  }
});
