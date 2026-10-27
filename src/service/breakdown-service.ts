import { getAccount } from '../config/loader.js';
import {
  getInferenceUsage,
  getUsageWithEndpointColumn,
  QueryInterval,
  UsageRow,
} from '../ark/usage.js';
import { listEndpoints, ListEndpointItem } from '../ark/endpoint.js';

export type Totals = {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokensHit: number;
  reqCnt: number;
};

export type DailyPoint = {
  Day: string;
  TotalTokens: number;
  InputTokens: number;
  OutputTokens: number;
  ReqCnt: number;
};

export type BreakdownEndpoint = {
  endpointId: string;
  name: string;
  model: string;
  modelVersion: string;
  status: string;
  totals: Totals;
  daily: DailyPoint[];
};

export type BreakdownResult = {
  account: string;
  project: string;
  totals: Totals;
  endpoints: BreakdownEndpoint[];
  unattributed: Totals;
  derived: 'column' | 'per-endpoint';
};

export type BreakdownParams = {
  startDate: string;
  endDate: string;
  interval: QueryInterval;
};

// 回退路径要逐个接入点查询，限制上限避免请求数失控
const FALLBACK_MAX_ENDPOINTS = 20;

function emptyTotals(): Totals {
  return { totalTokens: 0, inputTokens: 0, outputTokens: 0, cacheTokensHit: 0, reqCnt: 0 };
}

function addRow(totals: Totals, row: UsageRow): void {
  totals.totalTokens += Number(row.TotalTokens ?? 0);
  totals.inputTokens += Number(row.InputTokens ?? 0);
  totals.outputTokens += Number(row.OutputTokens ?? 0);
  totals.cacheTokensHit += Number(row.CacheTokensHit ?? 0);
  totals.reqCnt += Number(row.ReqCnt ?? 0);
}

function addTotals(target: Totals, source: Totals): void {
  target.totalTokens += source.totalTokens;
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheTokensHit += source.cacheTokensHit;
  target.reqCnt += source.reqCnt;
}

function toDaily(rows: UsageRow[]): DailyPoint[] {
  return rows
    .map((row) => ({
      Day: String(row.Day ?? ''),
      TotalTokens: Number(row.TotalTokens ?? 0),
      InputTokens: Number(row.InputTokens ?? 0),
      OutputTokens: Number(row.OutputTokens ?? 0),
      ReqCnt: Number(row.ReqCnt ?? 0),
    }))
    .filter((d) => d.Day !== '')
    .sort((a, b) => a.Day.localeCompare(b.Day));
}

function modelOf(ep: ListEndpointItem): { model: string; version: string } {
  const foundation = ep.ModelReference?.FoundationModel;
  if (foundation?.Name) {
    return { model: foundation.Name, version: foundation.ModelVersion ?? '' };
  }
  const custom = ep.ModelReference?.CustomModelId;
  if (custom) return { model: custom, version: '' };
  return { model: '未知模型', version: '' };
}

export type EndpointBuckets = Map<string, { totals: Totals; rows: UsageRow[] }>;

// 按 ModelEndpoint 列分组；空值归入「未归属」
export function groupByEndpoint(rows: UsageRow[]): {
  byEndpoint: EndpointBuckets;
  unattributedRows: UsageRow[];
} {
  const byEndpoint: EndpointBuckets = new Map();
  const unattributedRows: UsageRow[] = [];

  for (const row of rows) {
    const endpointId = String(row.ModelEndpoint ?? '');
    if (!endpointId) {
      unattributedRows.push(row);
      continue;
    }
    const bucket = byEndpoint.get(endpointId) ?? { totals: emptyTotals(), rows: [] };
    addRow(bucket.totals, row);
    bucket.rows.push(row);
    byEndpoint.set(endpointId, bucket);
  }

  return { byEndpoint, unattributedRows };
}

// 纯函数：把接入点清单与用量分组合并成最终结果（不做任何 I/O）
export function assembleBreakdown(input: {
  account: string;
  project: string;
  items: ListEndpointItem[];
  byEndpoint: EndpointBuckets;
  unattributedRows: UsageRow[];
  derived: 'column' | 'per-endpoint';
}): BreakdownResult {
  const endpoints: BreakdownEndpoint[] = input.items.map((ep) => {
    const bucket = input.byEndpoint.get(ep.Id);
    const model = modelOf(ep);
    return {
      endpointId: ep.Id,
      name: ep.Name,
      model: model.model,
      modelVersion: model.version,
      status: ep.Status,
      totals: bucket?.totals ?? emptyTotals(),
      daily: toDaily(bucket?.rows ?? []),
    };
  });

  // 用量里出现但接入点清单没有的 ID（例如已删除的接入点）：仍然列出，避免合计少算
  const knownIds = new Set(input.items.map((item) => item.Id));
  for (const [endpointId, bucket] of input.byEndpoint) {
    if (knownIds.has(endpointId)) continue;
    endpoints.push({
      endpointId,
      name: endpointId,
      model: '未知模型',
      modelVersion: '',
      status: 'Unknown',
      totals: bucket.totals,
      daily: toDaily(bucket.rows),
    });
  }

  // 用量降序，零用量置底（同值时按名称稳定排序）
  endpoints.sort((a, b) => {
    if (b.totals.totalTokens !== a.totals.totalTokens) {
      return b.totals.totalTokens - a.totals.totalTokens;
    }
    return a.name.localeCompare(b.name);
  });

  const totals = emptyTotals();
  for (const ep of endpoints) addTotals(totals, ep.totals);

  const unattributed = emptyTotals();
  for (const row of input.unattributedRows) addRow(unattributed, row);
  addTotals(totals, unattributed);

  return {
    account: input.account,
    project: input.project,
    totals,
    endpoints,
    unattributed,
    derived: input.derived,
  };
}

export async function getUsageBreakdown(
  accountName: string,
  params: BreakdownParams,
): Promise<BreakdownResult> {
  const account = getAccount(accountName);
  if (!account) {
    throw new Error(`账户 "${accountName}" 不存在`);
  }
  const project = account.project ?? account.name;

  // 左表：全部接入点（含零用量），用于补齐与展示模型名
  const endpointList = await listEndpoints(account, { pageSize: 100, projectName: project });
  const items = endpointList.items;

  const baseParams = {
    startDate: params.startDate,
    endDate: params.endDate,
    interval: params.interval,
    projectName: project,
  };

  const columnResult = await getUsageWithEndpointColumn(account, baseParams);

  let byEndpoint: EndpointBuckets;
  let unattributedRows: UsageRow[] = [];
  let derived: 'column' | 'per-endpoint' = 'column';

  if (columnResult.hasEndpointColumn) {
    ({ byEndpoint, unattributedRows } = groupByEndpoint(columnResult.rows));
  } else {
    // Ark 未返回接入点维度列时，改为逐个接入点查询
    if (items.length > FALLBACK_MAX_ENDPOINTS) {
      throw new Error(
        `当前 Ark 响应未包含接入点维度，且接入点数量 ${items.length} 超过 ${FALLBACK_MAX_ENDPOINTS}，无法拆分`,
      );
    }
    derived = 'per-endpoint';
    byEndpoint = new Map();
    for (const ep of items) {
      const rows = await getInferenceUsage(account, {
        ...baseParams,
        filters: [{ Key: 'ModelEndpoint', Values: [ep.Id] }],
      });
      const bucket = { totals: emptyTotals(), rows };
      for (const row of rows) addRow(bucket.totals, row);
      byEndpoint.set(ep.Id, bucket);
    }
  }

  return assembleBreakdown({
    account: account.name,
    project,
    items,
    byEndpoint,
    unattributedRows,
    derived,
  });
}
