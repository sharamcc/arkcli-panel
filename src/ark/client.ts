import { signRequest } from './signer.js';
import { AccountConfig } from '../types/account.js';
import { AppError } from '../types/errors.js';

// Ark 单次调用上限；必须小于 nginx 与前端超时，避免后端仍在查询时链路先断开
const ARK_TIMEOUT_MS = 15_000;

// 只读 Action 白名单——防止误调用写操作
const READ_ONLY_ACTIONS = new Set([
  'GetInferenceUsage',
  'ListEndpoints',
  'GetEndpoint',
  'DescribeEndpoint',
  'ListFoundationModels',
]);

export type ArkResult<T = unknown> = {
  ResponseMetadata: {
    RequestId: string;
    Action: string;
    Version: string;
    Service: string;
    Region: string;
    Error?: { Code: string; Message: string };
  };
  Result?: T;
};

function isTimeoutError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('name' in err)) return false;
  const name = String((err as { name?: unknown }).name);
  return name === 'TimeoutError' || name === 'AbortError';
}

// 调用 Ark 控制平面 OpenAPI，自动 AK/SK 签名
export async function callArk<T = unknown>(opts: {
  account: AccountConfig;
  action: string;
  body: Record<string, unknown>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<ArkResult<T>> {
  const { account, action, body } = opts;

  if (!READ_ONLY_ACTIONS.has(action)) {
    throw new Error(`Action "${action}" 不在只读白名单内，已拒绝调用`);
  }

  const bodyStr = JSON.stringify(body);
  const { headers, url } = signRequest({
    account,
    action,
    body: bodyStr,
  });

  const timeoutMs = opts.timeoutMs ?? ARK_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  let resp: Response;
  let text: string;
  try {
    resp = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: bodyStr,
      signal: AbortSignal.timeout(timeoutMs),
    });
    text = await resp.text();
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new AppError('ark.timeout', `Ark ${action} 请求超时（${timeoutMs}ms）`);
    }
    throw err;
  }

  let json: ArkResult<T>;
  // 网关层超时可能返回 HTML/空响应，先按状态码判定，避免落到“非 JSON”错误
  if (resp.status === 408 || resp.status === 504) {
    throw new AppError('ark.timeout', `Ark ${action} 请求超时（HTTP ${resp.status}）`);
  }
  try {
    json = JSON.parse(text) as ArkResult<T>;
  } catch {
    throw new Error(`Ark 响应非 JSON: ${text.slice(0, 200)}`);
  }

  const arkError = json.ResponseMetadata?.Error;
  if (arkError) {
    throw new Error(`Ark ${action} 错误 [${arkError.Code}]: ${arkError.Message}`);
  }
  if (!resp.ok) {
    throw new Error(`Ark HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }

  return json;
}
