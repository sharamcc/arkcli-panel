import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const originalCwd = process.cwd();
const originalFetch = globalThis.fetch;
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arkcli-panel-breakdown-'));
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

const { getUsageBreakdown } = await import('../src/service/breakdown-service.js');

after(() => {
  globalThis.fetch = originalFetch;
  process.chdir(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function arkResponse(result: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        ResponseMetadata: {
          RequestId: 'test-request',
          Action: 'test',
          Version: '2024-01-01',
          Service: 'ark',
          Region: 'ap-southeast-1',
        },
        Result: result,
      }),
  } as Response;
}

function endpoint(id: string) {
  return {
    Id: id,
    Name: `endpoint-${id}`,
    Status: 'Running',
    ProjectName: 'bd-account',
    EndpointModelType: 'FoundationModel',
    ModelReference: { FoundationModel: { Name: 'test-model', ModelVersion: '1' } },
    CreateTime: '2026-10-01T00:00:00Z',
    UpdateTime: '2026-10-01T00:00:00Z',
  };
}

test('breakdown 回退逐接入点查询并发不超过 5，结果完整', async () => {
  const ids = Array.from({ length: 6 }, (_, index) => `ep-${index + 1}`);
  let fallbackActive = 0;
  let fallbackMaxActive = 0;

  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input));
    const action = url.searchParams.get('Action');
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      Filters?: { Values?: string[] }[];
    };

    if (action === 'ListEndpoints') {
      return arkResponse({
        Items: ids.map(endpoint),
        TotalCount: ids.length,
        PageNumber: 1,
        PageSize: 100,
      });
    }

    if (action === 'GetInferenceUsage') {
      const endpointId = body.Filters?.[0]?.Values?.[0];
      if (endpointId) {
        fallbackActive += 1;
        fallbackMaxActive = Math.max(fallbackMaxActive, fallbackActive);
        try {
          await new Promise((resolve) => setTimeout(resolve, 20));
          const total = Number(endpointId.split('-')[1]) * 10;
          return arkResponse({
            Fields: [
              { Name: 'Day', Type: 'DATE' },
              { Name: 'TotalTokens', Type: 'BIGINT' },
            ],
            Data: [['2026-10-28', total]],
            DataCount: 1,
          });
        } finally {
          fallbackActive -= 1;
        }
      }

      // 首次列探测：不返回 ModelEndpoint 列，强制走逐接入点回退
      return arkResponse({
        Fields: [
          { Name: 'Day', Type: 'DATE' },
          { Name: 'TotalTokens', Type: 'BIGINT' },
        ],
        Data: [],
        DataCount: 0,
      });
    }

    throw new Error(`unexpected action: ${action}`);
  }) as typeof fetch;

  const result = await getUsageBreakdown('bd-account', {
    startDate: '2026-10-28',
    endDate: '2026-10-28',
    interval: 'Day',
  });

  assert.equal(fallbackMaxActive, 5);
  assert.equal(result.derived, 'per-endpoint');
  assert.equal(result.endpoints.length, 6);
  assert.equal(result.totals.totalTokens, 210);
  assert.deepEqual(
    result.endpoints.map((item) => item.totals.totalTokens).sort((a, b) => a - b),
    [10, 20, 30, 40, 50, 60],
  );
});
