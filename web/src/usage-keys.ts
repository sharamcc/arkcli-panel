export type Granularity = 'day' | 'hour';

type UsageRowLike = Record<string, string | number>;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

// 小时模式下的完整槽位：每天 24 个，格式 YYYY-MM-DD HH
export function hourKeys(days: string[]): string[] {
  const keys: string[] = [];
  for (const day of days) {
    for (let hour = 0; hour < 24; hour += 1) {
      keys.push(`${day} ${pad2(hour)}`);
    }
  }
  return keys;
}

// 单行 usage 在指定粒度下的唯一 key；Hour 可能是字符串或数字
export function usageKey(row: UsageRowLike, granularity: Granularity): string {
  const day = String(row.Day ?? '');
  if (granularity === 'day') return day;
  return `${day} ${pad2(Number(row.Hour ?? 0))}`;
}
