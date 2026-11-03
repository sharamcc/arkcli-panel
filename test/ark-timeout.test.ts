import assert from 'node:assert/strict';
import test from 'node:test';
import { callArk } from '../src/ark/client.js';
import { getEndpoint } from '../src/ark/endpoint.js';
import { AppError } from '../src/types/errors.js';

const account = {
  name: 'test-account',
  ak: 'AKTEST',
  sk: 'SKTEST',
  region: 'ap-southeast-1',
  enabled: true,
};

const hangingFetch: typeof fetch = (_input, init) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) {
      reject(new Error('missing AbortSignal'));
      return;
    }
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });

test('Ark 超时转换为稳定错误码，abort 后不产生未处理 rejection', async () => {
  // AbortSignal.timeout 的定时器是 unref 的；仅剩 pending promise 时
  // node:test 可能先判定事件循环已清空并取消测试。这里用 ref 定时器保持事件循环。
  const keepAlive = setTimeout(() => {}, 200);
  try {
    await assert.rejects(
      callArk({
        account,
        action: 'ListEndpoints',
        body: {},
        timeoutMs: 20,
        fetchImpl: hangingFetch,
      }),
      (err: unknown) => err instanceof AppError && err.code === 'ark.timeout',
    );
  } finally {
    clearTimeout(keepAlive);
  }
});

test('Ark 网关 HTTP 504 也映射为 ark.timeout', async () => {
  const gatewayTimeoutFetch: typeof fetch = async () => {
    return {
      ok: false,
      status: 504,
      text: async () =>
        JSON.stringify({
          ResponseMetadata: {
            RequestId: 'test-request',
            Action: 'ListEndpoints',
            Version: '2024-01-01',
            Service: 'ark',
            Region: 'ap-southeast-1',
          },
        }),
    } as Response;
  };

  await assert.rejects(
    callArk({
      account,
      action: 'ListEndpoints',
      body: {},
      fetchImpl: gatewayTimeoutFetch,
    }),
    (err: unknown) => err instanceof AppError && err.code === 'ark.timeout',
  );
});

test('超时不会被误判为 NotFound 而触发 DescribeEndpoint 回退', async () => {
  let calls = 0;
  const timeoutFetch: typeof fetch = async () => {
    calls += 1;
    const err = new Error('simulated timeout');
    err.name = 'TimeoutError';
    throw err;
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = timeoutFetch;
  try {
    await assert.rejects(
      getEndpoint(account, 'ep-1'),
      (err: unknown) => err instanceof AppError && err.code === 'ark.timeout',
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
