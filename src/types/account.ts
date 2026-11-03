import { z } from 'zod';

export const NAME_PATTERN = /^[a-zA-Z0-9-]+$/;

// 账户名同时用于配置文件名与 URL 参数，统一在这里约束
export const AccountNameSchema = z
  .string()
  .min(1)
  .regex(NAME_PATTERN, '名称只允许字母、数字与短横线');

export const AccountNameParamsSchema = z.object({ name: AccountNameSchema });

export const AccountNameQuerySchema = z.object({ account: AccountNameSchema });

// 空 project 一律归一为 undefined，读取旧配置时也能落到账户名
const ProjectSchema = z
  .string()
  .transform((value) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  .optional();

// 子账户配置：每个子账户一个独立 JSON 文件，文件名须与 name 一致
export const AccountConfigSchema = z.object({
  name: z.string().regex(NAME_PATTERN),
  label: z.string().optional(),
  ak: z.string().min(1),
  sk: z.string().min(1),
  // Ark 项目名，留空时等于账户名
  project: ProjectSchema,
  region: z.string().default('ap-southeast-1'),
  enabled: z.boolean().default(true),
  note: z.string().optional(),
});

export type AccountConfig = z.infer<typeof AccountConfigSchema>;

// 新建账户的入参
export const CreateAccountSchema = z.object({
  name: AccountNameSchema.max(64),
  label: z.string().optional(),
  ak: z.string().min(1, 'AK 不能为空'),
  sk: z.string().min(1, 'SK 不能为空'),
  project: ProjectSchema,
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
  project: ProjectSchema,
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
