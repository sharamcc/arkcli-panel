import { loadAccounts, loadAllAccounts, projectNameOf, toAccountView } from '../config/loader.js';
import { getInferenceUsage, GetInferenceUsageParams, UsageRow } from '../ark/usage.js';
import { listEndpoints, ListEndpointsParams, ListEndpointItem } from '../ark/endpoint.js';
import {
  listFoundationModels,
  ListFoundationModelsParams,
  FoundationModelItem,
} from '../ark/model.js';
import { AccountView } from '../types/account.js';

// 并发上限，避免对 Ark API 造成压力
const CONCURRENCY_LIMIT = 5;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// 分批并发 + allSettled：单账户失败只写回自己的 error，不影响同批其他账户
async function runWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit = CONCURRENCY_LIMIT,
): Promise<{ result: R | null; error: string | null }[]> {
  const results: { result: R | null; error: string | null }[] = new Array(items.length);
  const batchSize = Math.max(1, limit);

  for (let offset = 0; offset < items.length; offset += batchSize) {
    const batch = items.slice(offset, offset + batchSize);
    const settled = await Promise.allSettled(
      batch.map((item) => Promise.resolve().then(() => fn(item))),
    );

    settled.forEach((outcome, index) => {
      const target = offset + index;
      results[target] =
        outcome.status === 'fulfilled'
          ? { result: outcome.value, error: null }
          : { result: null, error: errorMessage(outcome.reason) };
    });
  }

  return results;
}

export function listAccountViews(): AccountView[] {
  return loadAllAccounts().map(toAccountView);
}

export type PerAccountUsage = {
  account: string;
  project: string;
  usage: UsageRow[] | null;
  error: string | null;
};

export async function getUsageAcrossAccounts(
  params: GetInferenceUsageParams,
  accountName?: string,
): Promise<PerAccountUsage[]> {
  const accounts = loadAccounts();
  const targets = accountName ? accounts.filter((a) => a.name === accountName) : accounts;

  const results = await runWithConcurrency(targets, async (a) =>
    getInferenceUsage(a, { ...params, projectName: params.projectName || projectNameOf(a) }),
  );
  return targets.map((a, i) => ({
    account: a.name,
    project: projectNameOf(a),
    usage: results[i].result,
    error: results[i].error,
  }));
}

export type PerAccountEndpoints = {
  account: string;
  endpoints: ListEndpointItem[] | null;
  total: number;
  error: string | null;
};

export async function getEndpointsAcrossAccounts(
  params: ListEndpointsParams,
  accountName?: string,
): Promise<PerAccountEndpoints[]> {
  const accounts = loadAccounts();
  const targets = accountName ? accounts.filter((a) => a.name === accountName) : accounts;

  const results = await runWithConcurrency(targets, async (a) =>
    listEndpoints(a, { ...params, projectName: params.projectName || projectNameOf(a) }),
  );
  return targets.map((a, i) => ({
    account: a.name,
    endpoints: results[i].result?.items ?? null,
    total: results[i].result?.total ?? 0,
    error: results[i].error,
  }));
}

export type PerAccountModels = {
  account: string;
  models: FoundationModelItem[] | null;
  total: number;
  error: string | null;
};

export async function getModelsAcrossAccounts(
  params: ListFoundationModelsParams,
  accountName?: string,
): Promise<PerAccountModels[]> {
  const accounts = loadAccounts();
  const targets = accountName ? accounts.filter((a) => a.name === accountName) : accounts;

  const results = await runWithConcurrency(targets, async (a) => listFoundationModels(a, params));
  return targets.map((a, i) => ({
    account: a.name,
    models: results[i].result?.items ?? null,
    total: results[i].result?.total ?? 0,
    error: results[i].error,
  }));
}
