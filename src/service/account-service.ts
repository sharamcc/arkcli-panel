import { loadAccounts, loadAllAccounts, toAccountView } from '../config/loader.js';
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

async function runWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit = CONCURRENCY_LIMIT,
): Promise<{ result: R | null; error: string | null }[]> {
  const results: { result: R | null; error: string | null }[] = [];
  let cursor = 0;
  const workers = Math.min(limit, items.length);
  const run = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        results[idx] = { result: await fn(items[idx]), error: null };
      } catch (err) {
        results[idx] = { result: null, error: (err as Error).message };
      }
    }
  };
  await Promise.all(Array.from({ length: workers }, () => run()));
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
    getInferenceUsage(a, { ...params, projectName: params.projectName ?? a.project ?? a.name }),
  );
  return targets.map((a, i) => ({
    account: a.name,
    project: a.project ?? a.name,
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
    listEndpoints(a, { ...params, projectName: params.projectName ?? a.project ?? a.name }),
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
