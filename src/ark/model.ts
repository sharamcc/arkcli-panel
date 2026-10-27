import { callArk } from './client.js';
import { AccountConfig } from '../types/account.js';

export type FoundationModelItem = {
  Name: string;
  Description?: string;
  Introduction?: string;
  VendorName?: string;
  DisplayName?: string;
  PrimaryVersion?: string;
  AccessType?: string;
  ProjectName?: string;
  CreateTime?: string;
  UpdateTime?: string;
  Tags?: { Key: string; Value: string }[];
  FoundationModelTag?: {
    Languages?: string[];
    TaskTypes?: string[];
    CustomizedTags?: string[];
    Domains?: string[];
    UsedLibraries?: string[];
  };
};

export type ListFoundationModelsParams = {
  pageNumber?: number;
  pageSize?: number;
  name?: string; // 基础模型名称模糊匹配
  sortBy?: 'CreateTime' | 'UpdateTime';
  sortOrder?: 'Asc' | 'Desc';
};

export async function listFoundationModels(
  account: AccountConfig,
  params: ListFoundationModelsParams = {},
): Promise<{ items: FoundationModelItem[]; total: number; pageNumber: number; pageSize: number }> {
  const body: Record<string, unknown> = {
    PageNumber: params.pageNumber ?? 1,
    PageSize: params.pageSize ?? 100,
  };
  if (params.name) body.Filter = { Name: params.name };
  if (params.sortBy) body.SortBy = params.sortBy;
  if (params.sortOrder) body.SortOrder = params.sortOrder;

  const resp = await callArk<{
    Items: FoundationModelItem[];
    TotalCount: number;
    PageNumber: number;
    PageSize: number;
  }>({
    account,
    action: 'ListFoundationModels',
    body,
  });

  const r = resp.Result!;
  return {
    items: r.Items ?? [],
    total: r.TotalCount ?? 0,
    pageNumber: r.PageNumber ?? params.pageNumber ?? 1,
    pageSize: r.PageSize ?? params.pageSize ?? 100,
  };
}
