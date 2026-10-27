import { Signer } from '@volcengine/openapi';
import { AccountConfig } from '../types/account.js';

const DEFAULT_REGION = 'ap-southeast-1';
const DEFAULT_HOST = 'ark.ap-southeast-1.byteplusapi.com';

// 用 AK/SK 对请求签名，返回带签名头的 headers
export function signRequest(opts: {
  account: AccountConfig;
  action: string;
  version?: string;
  body: string;
  method?: string;
}): { headers: Record<string, string>; url: string } {
  const { account, action, body, method = 'POST' } = opts;
  const version = opts.version ?? '2024-01-01';
  const region = account.region || DEFAULT_REGION;
  const host = DEFAULT_HOST;

  const requestData = {
    region,
    method,
    params: { Action: action, Version: version },
    headers: {
      Host: host,
      'Content-Type': 'application/json',
    },
    body,
  };

  const signer = new Signer(requestData, 'ark'); // service = 'ark'
  signer.addAuthorization({
    accessKeyId: account.ak,
    secretKey: account.sk,
    sessionToken: '',
  });

  return {
    headers: requestData.headers as Record<string, string>,
    url: `https://${host}/?Action=${action}&Version=${version}`,
  };
}
