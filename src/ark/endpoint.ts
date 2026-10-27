import { callArk } from './client.js';
import { AccountConfig } from '../types/account.js';

export type EndpointStatus = 'Running' | 'Scheduling' | 'Abnormal' | 'Stopped';
export type EndpointModelType = 'FoundationModel' | 'CustomModel' | 'ServiceModel';

export type ListEndpointItem = {
  Id: string;
  Name: string;
  Status: EndpointStatus;
  StatusReason?: string;
  ProjectName: string;
  EndpointModelType: EndpointModelType;
  ModelReference: {
    FoundationModel?: { Name: string; ModelVersion: string };
    CustomModelId?: string;
  };
  RateLimit?: { Rpm: number; Tpm: number; Ipm?: number };
  PaymentType?: string;
  ModelUnitId?: string;
  CreateTime: string;
  UpdateTime: string;
  Description?: string;
  Tags?: { Key: string; Value: string }[];
  ContentGeneration?: { ConcurrentRequests: number; CreateTaskRpm: number };
};

export type ListEndpointsParams = {
  pageNumber?: number;
  pageSize?: number;
  projectName?: string;
  statuses?: EndpointStatus[];
  ids?: string[];
  name?: string;
};

export async function listEndpoints(
  account: AccountConfig,
  params: ListEndpointsParams = {},
): Promise<{ items: ListEndpointItem[]; total: number; pageNumber: number; pageSize: number }> {
  const body: Record<string, unknown> = {
    PageNumber: params.pageNumber ?? 1,
    PageSize: params.pageSize ?? 100,
  };
  if (params.projectName) body.ProjectName = params.projectName;

  const filter: Record<string, unknown> = {};
  if (params.statuses?.length) filter.Statuses = params.statuses;
  if (params.ids?.length) filter.Ids = params.ids;
  if (params.name) filter.Name = params.name;
  if (Object.keys(filter).length) body.Filter = filter;

  const resp = await callArk<{
    Items: ListEndpointItem[];
    TotalCount: number;
    PageNumber: number;
    PageSize: number;
  }>({
    account,
    action: 'ListEndpoints',
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

// GetEndpoint 完整响应（比 ListEndpoints 多了 BatchOnly/Moderation/RollingId/ScaleTierId/SupportRolling/SupportScaleTier）
export type EndpointDetail = {
  Id: string;
  Name: string;
  Status: EndpointStatus;
  StatusReason?: string;
  ProjectName: string;
  EndpointModelType: EndpointModelType;
  ModelReference: {
    FoundationModel?: { Name: string; ModelVersion: string };
    CustomModelId?: string;
  };
  RateLimit?: { Rpm: number; Tpm: number; Ipm?: number };
  ModelUnitId?: string;
  ScaleTierId?: string;
  PaymentType?: string;
  Description?: string;
  CreateTime: string;
  UpdateTime: string;
  Tags?: { Key: string; Value: string }[];
  ContentGeneration?: { ConcurrentRequests: number; CreateTaskRpm: number };
  BatchOnly?: boolean;
  Moderation?: { Strategy: 'Default' | 'Basic' | 'Skip' | 'Customized' };
  RollingId?: string;
  SupportRolling?: boolean;
  SupportScaleTier?: boolean;
};

// 详情接口：官方文档称 GetEndpoint，旧名 DescribeEndpoint 也可能存在
// 先调 GetEndpoint，若报 ActionNotFound 再回退 DescribeEndpoint
export async function getEndpoint(account: AccountConfig, id: string): Promise<EndpointDetail> {
  try {
    const resp = await callArk<EndpointDetail>({
      account,
      action: 'GetEndpoint',
      body: { Id: id },
    });
    return resp.Result!;
  } catch (err) {
    const msg = (err as Error).message;
    if (
      msg.includes('ActionNotFound') ||
      msg.includes('InvalidAction') ||
      msg.includes('NotFound')
    ) {
      const resp = await callArk<EndpointDetail>({
        account,
        action: 'DescribeEndpoint',
        body: { Id: id },
      });
      return resp.Result!;
    }
    throw err;
  }
}
