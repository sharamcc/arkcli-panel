export type AccountView = {
  name: string;
  label?: string;
  ak_masked: string;
  project: string;
  region: string;
  enabled: boolean;
  note?: string;
};

export type UsageRow = Record<string, string | number>;

export type PerAccountUsage = {
  account: string;
  project: string;
  usage: UsageRow[] | null;
  error: string | null;
};

export type EndpointItem = {
  Id: string;
  Name: string;
  Status: 'Running' | 'Scheduling' | 'Abnormal' | 'Stopped';
  StatusReason?: string;
  ProjectName: string;
  EndpointModelType: string;
  ModelReference?: {
    FoundationModel?: { Name: string; ModelVersion: string };
    CustomModelId?: string;
  };
  RateLimit?: { Rpm: number; Tpm: number; Ipm?: number };
  CreateTime: string;
  UpdateTime: string;
  Description?: string;
  Tags?: { Key: string; Value: string }[];
};

export type PerAccountEndpoints = {
  account: string;
  endpoints: EndpointItem[] | null;
  total: number;
  error: string | null;
};

export type BreakdownTotals = {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokensHit: number;
  reqCnt: number;
};

export type BreakdownEndpoint = {
  endpointId: string;
  name: string;
  model: string;
  modelVersion: string;
  status: string;
  totals: BreakdownTotals;
  daily: {
    Day: string;
    TotalTokens: number;
    InputTokens: number;
    OutputTokens: number;
    ReqCnt: number;
  }[];
};

export type BreakdownResult = {
  account: string;
  project: string;
  totals: BreakdownTotals;
  endpoints: BreakdownEndpoint[];
  unattributed: BreakdownTotals;
  derived: 'column' | 'per-endpoint';
};

export type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: unknown;
};

async function request<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const resp = await fetch(path, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const json = (await resp
    .json()
    .catch(() => ({ success: false, error: `HTTP ${resp.status}` }))) as ApiEnvelope<T>;
  return json;
}

export function listAccounts() {
  return request<AccountView[]>('/api/accounts');
}

export function fetchUsage(params: { start: string; end: string; interval?: 'Day' | 'Hour' }) {
  const q = new URLSearchParams({
    start: params.start,
    end: params.end,
    interval: params.interval ?? 'Day',
  });
  return request<PerAccountUsage[]>(`/api/usage?${q.toString()}`);
}

export function fetchEndpoints(params: { account?: string; status?: string; name?: string }) {
  const q = new URLSearchParams();
  if (params.account) q.set('account', params.account);
  if (params.status) q.set('status', params.status);
  if (params.name) q.set('name', params.name);
  return request<PerAccountEndpoints[]>(`/api/endpoints?${q.toString()}`);
}

export function fetchEndpointDetail(account: string, id: string) {
  return request<Record<string, unknown>>(
    `/api/endpoints/${encodeURIComponent(id)}?account=${encodeURIComponent(account)}`,
  );
}

export function fetchBreakdown(params: {
  account: string;
  start: string;
  end: string;
  interval?: 'Day' | 'Hour';
}) {
  const q = new URLSearchParams({
    account: params.account,
    start: params.start,
    end: params.end,
    interval: params.interval ?? 'Day',
  });
  return request<BreakdownResult>(`/api/usage/breakdown?${q.toString()}`);
}

export function verifyAccount(name: string) {
  return request<{ ok: boolean; project: string; error?: string; total?: number }>(
    `/api/accounts/${encodeURIComponent(name)}/verify`,
  );
}

export type AccountInput = {
  name?: string;
  label?: string;
  ak?: string;
  sk?: string;
  project?: string;
  enabled?: boolean;
  note?: string;
};

export function createAccount(input: AccountInput) {
  return request<{ name: string }>('/api/accounts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateAccount(name: string, input: AccountInput) {
  return request<{ name: string }>(`/api/accounts/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function deleteAccount(name: string) {
  return request<{ name: string }>(`/api/accounts/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

// 数字格式化：完整千分位，附「亿/万」辅助
export function formatTokens(value: number): string {
  return value.toLocaleString('zh-CN');
}

export function formatTokensShort(value: number): string {
  if (value >= 1e8) return `约 ${(value / 1e8).toFixed(2)} 亿`;
  if (value >= 1e4) return `约 ${(value / 1e4).toFixed(1)} 万`;
  return '';
}

export function todayString(): string {
  // 按本地时区取当天日期
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

export function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}
