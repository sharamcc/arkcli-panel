import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleBreakdown, groupByEndpoint } from '../src/service/breakdown-service.js';
import type { ListEndpointItem } from '../src/ark/endpoint.js';
import type { UsageRow } from '../src/ark/usage.js';

function endpoint(over: Partial<ListEndpointItem> & { Id: string }): ListEndpointItem {
  return {
    Name: over.Id,
    Status: 'Running',
    ProjectName: 'test01',
    EndpointModelType: 'FoundationModel',
    CreateTime: '2026-10-01T00:00:00Z',
    UpdateTime: '2026-10-01T00:00:00Z',
    ...over,
  };
}

function usageRow(over: Partial<UsageRow> & { Day: string }): UsageRow {
  return {
    ModelEndpoint: 'ep-a',
    TotalTokens: 0,
    InputTokens: 0,
    OutputTokens: 0,
    CacheTokensHit: 0,
    ReqCnt: 0,
    ...over,
  };
}

test('groupByEndpoint：按接入点聚合，并分离未归属行', () => {
  const { byEndpoint, unattributedRows } = groupByEndpoint([
    usageRow({
      Day: '2026-10-01',
      ModelEndpoint: 'ep-a',
      TotalTokens: 100,
      InputTokens: 40,
      OutputTokens: 60,
      CacheTokensHit: 10,
      ReqCnt: 2,
    }),
    usageRow({
      Day: '2026-10-02',
      ModelEndpoint: 'ep-a',
      TotalTokens: 50,
      InputTokens: 20,
      OutputTokens: 30,
      ReqCnt: 1,
    }),
    usageRow({ Day: '2026-10-01', ModelEndpoint: 'ep-b', TotalTokens: 30, ReqCnt: 3 }),
    usageRow({ Day: '2026-10-01', ModelEndpoint: '', TotalTokens: 7, ReqCnt: 1 }),
  ]);

  const a = byEndpoint.get('ep-a');
  assert.equal(a?.totals.totalTokens, 150);
  assert.equal(a?.totals.inputTokens, 60);
  assert.equal(a?.totals.outputTokens, 90);
  assert.equal(a?.totals.cacheTokensHit, 10);
  assert.equal(a?.totals.reqCnt, 3);
  assert.equal(a?.rows.length, 2);

  assert.equal(byEndpoint.get('ep-b')?.totals.totalTokens, 30);
  assert.equal(unattributedRows.length, 1);
  assert.equal(unattributedRows[0].TotalTokens, 7);
});

test('groupByEndpoint：缺失 ModelEndpoint 字段也归入未归属', () => {
  const row: UsageRow = { Day: '2026-10-01', TotalTokens: 12, ReqCnt: 1 };
  const { byEndpoint, unattributedRows } = groupByEndpoint([row]);

  assert.equal(byEndpoint.size, 0);
  assert.equal(unattributedRows.length, 1);
});

test('assembleBreakdown：零用量接入点仍然列出且数值为 0', () => {
  const items = [
    endpoint({ Id: 'ep-a', Name: '有用量' }),
    endpoint({ Id: 'ep-b', Name: '无用量' }),
  ];
  const { byEndpoint, unattributedRows } = groupByEndpoint([
    usageRow({ Day: '2026-10-01', ModelEndpoint: 'ep-a', TotalTokens: 100, ReqCnt: 1 }),
  ]);

  const result = assembleBreakdown({
    account: 'test01',
    project: 'test01',
    items,
    byEndpoint,
    unattributedRows,
    derived: 'column',
  });

  assert.equal(result.endpoints.length, 2);
  const empty = result.endpoints.find((ep) => ep.endpointId === 'ep-b');
  assert.equal(empty?.totals.totalTokens, 0);
  assert.deepEqual(empty?.daily, []);
});

test('assembleBreakdown：按用量降序，零值置底，同值按名称排序', () => {
  const items = [
    endpoint({ Id: 'ep-a', Name: 'Zeta' }),
    endpoint({ Id: 'ep-b', Name: 'Beta' }),
    endpoint({ Id: 'ep-c', Name: 'Alpha' }),
    endpoint({ Id: 'ep-d', Name: 'Delta' }),
  ];
  const { byEndpoint, unattributedRows } = groupByEndpoint([
    usageRow({ Day: '2026-10-01', ModelEndpoint: 'ep-a', TotalTokens: 100 }),
    usageRow({ Day: '2026-10-01', ModelEndpoint: 'ep-c', TotalTokens: 100 }),
  ]);

  const result = assembleBreakdown({
    account: 'test01',
    project: 'test01',
    items,
    byEndpoint,
    unattributedRows,
    derived: 'column',
  });

  assert.deepEqual(
    result.endpoints.map((ep) => ep.name),
    ['Alpha', 'Zeta', 'Beta', 'Delta'],
  );
  assert.deepEqual(
    result.endpoints.map((ep) => ep.totals.totalTokens),
    [100, 100, 0, 0],
  );
});

test('assembleBreakdown：逐日数据按日期升序', () => {
  const items = [endpoint({ Id: 'ep-a' })];
  const { byEndpoint, unattributedRows } = groupByEndpoint([
    usageRow({ Day: '2026-10-03', ModelEndpoint: 'ep-a', TotalTokens: 30 }),
    usageRow({ Day: '2026-10-01', ModelEndpoint: 'ep-a', TotalTokens: 10 }),
  ]);

  const result = assembleBreakdown({
    account: 'test01',
    project: 'test01',
    items,
    byEndpoint,
    unattributedRows,
    derived: 'column',
  });

  assert.deepEqual(
    result.endpoints[0].daily.map((d) => d.Day),
    ['2026-10-01', '2026-10-03'],
  );
});

test('assembleBreakdown：总计 = 各接入点之和 + 未归属', () => {
  const items = [endpoint({ Id: 'ep-a' }), endpoint({ Id: 'ep-b' })];
  const { byEndpoint, unattributedRows } = groupByEndpoint([
    usageRow({ Day: '2026-10-01', ModelEndpoint: 'ep-a', TotalTokens: 60, ReqCnt: 2 }),
    usageRow({ Day: '2026-10-01', ModelEndpoint: 'ep-b', TotalTokens: 40, ReqCnt: 1 }),
    usageRow({ Day: '2026-10-01', ModelEndpoint: '', TotalTokens: 5, ReqCnt: 1 }),
  ]);

  const result = assembleBreakdown({
    account: 'test01',
    project: 'test01',
    items,
    byEndpoint,
    unattributedRows,
    derived: 'column',
  });

  assert.equal(result.totals.totalTokens, 105);
  assert.equal(result.totals.reqCnt, 4);
  assert.equal(result.unattributed.totalTokens, 5);
  assert.equal(
    result.endpoints.reduce((sum, ep) => sum + ep.totals.totalTokens, 0) +
      result.unattributed.totalTokens,
    result.totals.totalTokens,
  );
});

test('assembleBreakdown：模型名来自基础模型、定制模型或未知', () => {
  const items = [
    endpoint({
      Id: 'ep-a',
      ModelReference: { FoundationModel: { Name: 'seed-sc', ModelVersion: '260628' } },
    }),
    endpoint({ Id: 'ep-b', ModelReference: { CustomModelId: 'cm-123' } }),
    endpoint({ Id: 'ep-c', ModelReference: {} }),
  ];
  const { byEndpoint, unattributedRows } = groupByEndpoint([]);

  const result = assembleBreakdown({
    account: 'test01',
    project: 'test01',
    items,
    byEndpoint,
    unattributedRows,
    derived: 'column',
  });

  const byId = new Map(result.endpoints.map((ep) => [ep.endpointId, ep]));
  assert.equal(byId.get('ep-a')?.model, 'seed-sc');
  assert.equal(byId.get('ep-a')?.modelVersion, '260628');
  assert.equal(byId.get('ep-b')?.model, 'cm-123');
  assert.equal(byId.get('ep-c')?.model, '未知模型');
});

test('assembleBreakdown：用量中出现清单外的接入点 ID 时仍计入总计', () => {
  const items = [endpoint({ Id: 'ep-a' })];
  const { byEndpoint, unattributedRows } = groupByEndpoint([
    usageRow({ Day: '2026-10-01', ModelEndpoint: 'ep-a', TotalTokens: 100 }),
    usageRow({ Day: '2026-10-01', ModelEndpoint: 'ep-deleted', TotalTokens: 50 }),
  ]);

  const result = assembleBreakdown({
    account: 'test01',
    project: 'test01',
    items,
    byEndpoint,
    unattributedRows,
    derived: 'column',
  });

  const ghost = result.endpoints.find((ep) => ep.endpointId === 'ep-deleted');
  assert.ok(ghost, '清单外的接入点应出现在结果中');
  assert.equal(ghost?.name, 'ep-deleted');
  assert.equal(ghost?.status, 'Unknown');
  assert.equal(ghost?.totals.totalTokens, 50);
  assert.equal(result.totals.totalTokens, 150);
});

test('assembleBreakdown：空输入返回空结果而非报错', () => {
  const { byEndpoint, unattributedRows } = groupByEndpoint([]);
  const result = assembleBreakdown({
    account: 'test01',
    project: 'test01',
    items: [],
    byEndpoint,
    unattributedRows,
    derived: 'column',
  });

  assert.deepEqual(result.endpoints, []);
  assert.equal(result.totals.totalTokens, 0);
  assert.equal(result.unattributed.totalTokens, 0);
});
