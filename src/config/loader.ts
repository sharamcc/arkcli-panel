import fs from 'node:fs';
import path from 'node:path';
import { AccountConfig, AccountConfigSchema, AccountView } from '../types/account.js';

export const ACCOUNTS_DIR = path.resolve(process.cwd(), 'configs', 'accounts');

function maskSecret(s: string): string {
  if (s.length <= 8) return '****';
  return `${s.slice(0, 4)}****${s.slice(-4)}`;
}

function accountPath(name: string): string {
  return path.join(ACCOUNTS_DIR, `${name}.json`);
}

// 解析单个账户文件；文件名与 name 不一致时视为无效
function readAccountFile(file: string): AccountConfig | null {
  const raw = fs.readFileSync(path.join(ACCOUNTS_DIR, file), 'utf-8');
  try {
    const validated = AccountConfigSchema.parse(JSON.parse(raw));
    const expectedName = file.replace(/\.json$/, '');
    if (validated.name !== expectedName) {
      console.warn(
        `[config] ${file}: name "${validated.name}" 与文件名 "${expectedName}" 不一致，已跳过`,
      );
      return null;
    }
    return validated;
  } catch (err) {
    console.warn(`[config] 解析 ${file} 失败: ${(err as Error).message}`);
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
  fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
  const target = accountPath(account.name);
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
