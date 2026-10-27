import { z } from 'zod';

const NAME_PATTERN = /^[a-zA-Z0-9-]+$/;

// 子账户配置：每个子账户一个独立 JSON 文件，文件名须与 name 一致
export const AccountConfigSchema = z.object({
  name: z.string().regex(NAME_PATTERN),
  label: z.string().optional(),
  ak: z.string().min(1),
  sk: z.string().min(1),
  // Ark 项目名，留空时等于账户名
  project: z.string().optional(),
  region: z.string().default('ap-southeast-1'),
  enabled: z.boolean().default(true),
  note: z.string().optional(),
});

export type AccountConfig = z.infer<typeof AccountConfigSchema>;

// 新建账户的入参
export const CreateAccountSchema = z.object({
  name: z.string().min(1).max(64).regex(NAME_PATTERN, '名称只允许字母、数字与短横线'),
  label: z.string().optional(),
  ak: z.string().min(1, 'AK 不能为空'),
  sk: z.string().min(1, 'SK 不能为空'),
  project: z.string().optional(),
  region: z.string().optional(),
  enabled: z.boolean().optional(),
  note: z.string().optional(),
});

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;

// 更新账户的入参：name 不可改；ak/sk 留空表示保持原值
export const UpdateAccountSchema = z.object({
  label: z.string().optional(),
  ak: z.string().optional(),
  sk: z.string().optional(),
  project: z.string().optional(),
  region: z.string().optional(),
  enabled: z.boolean().optional(),
  note: z.string().optional(),
});

export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>;

// 对外暴露的脱敏账户信息（绝不返回 sk）
export type AccountView = {
  name: string;
  label?: string;
  ak_masked: string;
  project: string;
  region: string;
  enabled: boolean;
  note?: string;
};
