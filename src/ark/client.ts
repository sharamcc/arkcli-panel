import { signRequest } from './signer.js';
import { AccountConfig } from '../types/account.js';

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

// 调用 Ark 控制平面 OpenAPI，自动 AK/SK 签名
export async function callArk<T = unknown>(opts: {
  account: AccountConfig;
  action: string;
  body: Record<string, unknown>;
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

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: bodyStr,
  });

  const text = await resp.text();
  let json: ArkResult<T>;
  try {
    json = JSON.parse(text) as ArkResult<T>;
  } catch {
    throw new Error(`Ark 响应非 JSON: ${text.slice(0, 200)}`);
  }

  if (json.ResponseMetadata.Error) {
    const e = json.ResponseMetadata.Error;
    throw new Error(`Ark ${action} 错误 [${e.Code}]: ${e.Message}`);
  }
  if (!resp.ok) {
    throw new Error(`Ark HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }

  return json;
}
