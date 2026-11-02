import fs from 'node:fs';
import path from 'node:path';
import { AccountConfig, AccountConfigSchema, AccountView, NAME_PATTERN } from '../types/account.js';
import { AppError } from '../types/errors.js';
import { tm } from '../i18n/messages.js';

export const ACCOUNTS_DIR = path.resolve(process.cwd(), 'configs', 'accounts');

function maskSecret(s: string): string {
  if (s.length <= 8) return '****';
  return `${s.slice(0, 4)}****${s.slice(-4)}`;
}

// 账户名会参与文件路径拼接；先按统一规则校验，再断言解析结果仍在账户目录内
function accountPath(name: string): string {
  if (!NAME_PATTERN.test(name)) {
    throw new AppError('account.invalid_name', '账户名不合法');
  }
  const target = path.resolve(ACCOUNTS_DIR, `${name}.json`);
  const relative = path.relative(ACCOUNTS_DIR, target);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new AppError('account.invalid_name', '账户名不合法');
  }
  return target;
}

// 解析单个账户文件；文件名与 name 不一致时视为无效
function readAccountFile(file: string): AccountConfig | null {
  const raw = fs.readFileSync(path.join(ACCOUNTS_DIR, file), 'utf-8');
  try {
    const validated = AccountConfigSchema.parse(JSON.parse(raw));
    const expectedName = file.replace(/\.json$/, '');
    if (validated.name !== expectedName) {
      console.warn(
        tm('config.nameMismatch', { file, name: validated.name, expected: expectedName }),
      );
      return null;
    }
    return validated;
  } catch (err) {
    console.warn(tm('config.parseFailed', { file, message: (err as Error).message }));
    return null;
  }
}

// 所有账户（含停用），用于账户管理页
export function loadAllAccounts(): AccountConfig[] {
  if (!fs.existsSync(ACCOUNTS_DIR)) return [];
  const files = fs
    .readdirSync(ACCOUNTS_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'accounts.example.json');

  return files
    .map(readAccountFile)
    .filter((a): a is AccountConfig => a !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// 仅启用账户，用于用量与接入点聚合
export function loadAccounts(): AccountConfig[] {
  return loadAllAccounts().filter((a) => a.enabled);
}

export function getAccount(name: string): AccountConfig | undefined {
  return loadAllAccounts().find((a) => a.name === name);
}

export function accountExists(name: string): boolean {
  return fs.existsSync(accountPath(name));
}

// 原子写入：先写临时文件再 rename，避免写入中断产生半个 JSON
export function writeAccount(account: AccountConfig): void {
  const target = accountPath(account.name);
  fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(account, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmp, target);
}

export function deleteAccountFile(name: string): boolean {
  const target = accountPath(name);
  if (!fs.existsSync(target)) return false;
  fs.unlinkSync(target);
  return true;
}

export function toAccountView(a: AccountConfig): AccountView {
  return {
    name: a.name,
    label: a.label,
    ak_masked: maskSecret(a.ak),
    project: a.project ?? a.name,
    region: a.region,
    enabled: a.enabled,
    note: a.note,
  };
}
