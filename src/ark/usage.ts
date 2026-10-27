import { callArk } from './client.js';
import { AccountConfig } from '../types/account.js';

export type QueryInterval = 'Hour' | 'Day';

export type UsageFilter = {
  Key:
    | 'AuthToken'
    | 'ModelUnitID'
    | 'BillingStatus'
    | 'ModelName'
    | 'ModelVersion'
    | 'ModelEndpoint'
    | 'BatchJobID'
    | 'EndpointName'
    | 'BatchType';
  Values?: string[];
  ValueLike?: string;
};

export type GetInferenceUsageParams = {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  interval: QueryInterval;
  projectName?: string;
  filters?: UsageFilter[];
};

// GetInferenceUsage 响应是列式存储：Fields 定义列名，Data 是二维数组
// 这里把它转成对象数组，便于前端消费
export type UsageRow = Record<string, string | number>;

export async function getInferenceUsage(
  account: AccountConfig,
  params: GetInferenceUsageParams,
): Promise<UsageRow[]> {
  const result = await fetchUsageRows(account, params, params.filters);
  return result.rows;
}

// 请求接入点维度列：Values 为空表示「不筛选，但返回该列」
export async function getUsageWithEndpointColumn(
  account: AccountConfig,
  params: GetInferenceUsageParams,
): Promise<{ rows: UsageRow[]; hasEndpointColumn: boolean }> {
  return fetchUsageRows(account, params, [{ Key: 'ModelEndpoint', Values: [] }]);
}

async function fetchUsageRows(
  account: AccountConfig,
  params: GetInferenceUsageParams,
  filters?: UsageFilter[],
): Promise<{ rows: UsageRow[]; hasEndpointColumn: boolean }> {
  const body: Record<string, unknown> = {
    QueryInterval: params.interval,
    StartTime: params.startDate,
    EndTime: params.endDate,
  };
  if (params.projectName) body.ProjectName = params.projectName;
  if (filters?.length) body.Filters = filters;

  const resp = await callArk<{
    Fields: { Name: string; Type: string }[];
    Data: (string | number)[][];
    DataCount: number;
  }>({
    account,
    action: 'GetInferenceUsage',
    body,
  });

  const result = resp.Result;
  if (!result || !result.Fields?.length) return { rows: [], hasEndpointColumn: false };

  const hasEndpointColumn = result.Fields.some((f) => f.Name === 'ModelEndpoint');

  // Ark 在 DataCount=0 时不返回 Data 字段，需按空数组处理
  const data = result.Data ?? [];
  const numericTypes = new Set(['BIGINT', 'INTEGER', 'DOUBLE']);
  const rows = data.map((row) => {
    const obj: UsageRow = {};
    result.Fields.forEach((field, i) => {
      const value = row[i];
      obj[field.Name] = numericTypes.has(field.Type) ? Number(value) : value;
    });
    return obj;
  });

  // Ark 返回的行不保证按日期有序，图表需要稳定顺序
  rows.sort((a, b) => String(a.Day ?? '').localeCompare(String(b.Day ?? '')));
  return { rows, hasEndpointColumn };
}
