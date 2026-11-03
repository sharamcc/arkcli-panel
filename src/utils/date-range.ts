import type { QueryInterval } from '../ark/usage.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

// 日模式含首尾 31 天（差值 30），小时模式含首尾 7 天（差值 6）
const MAX_SPAN_DAYS: Record<QueryInterval, number> = {
  Day: 30,
  Hour: 6,
};

export type DateRangeErrorCode =
  'usage.invalid_date' | 'usage.invalid_range' | 'usage.too_long' | 'usage.hour_too_long';

export type DateRangeResult =
  { ok: true; days: number } | { ok: false; code: DateRangeErrorCode; message: string };

// 严格校验日期：格式、真实日历日期、以及 ISO 往返一致
export function parseStrictDate(value: string): number | null {
  if (!DATE_PATTERN.test(value)) return null;

  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(timestamp)) return null;

  const normalized = new Date(timestamp).toISOString().slice(0, 10);
  return normalized === value ? timestamp : null;
}

export function parseDateRange(
  start: string,
  end: string,
  interval: QueryInterval,
): DateRangeResult {
  const startMs = parseStrictDate(start);
  const endMs = parseStrictDate(end);

  if (startMs === null || endMs === null) {
    return {
      ok: false,
      code: 'usage.invalid_date',
      message: '开始或结束日期不合法，请使用有效的 YYYY-MM-DD 日期',
    };
  }

  if (endMs < startMs) {
    return {
      ok: false,
      code: 'usage.invalid_range',
      message: '结束日期不能早于开始日期',
    };
  }

  const days = Math.round((endMs - startMs) / MS_PER_DAY);
  if (days > MAX_SPAN_DAYS[interval]) {
    if (interval === 'Hour') {
      return {
        ok: false,
        code: 'usage.hour_too_long',
        message: '小时模式最多查询 7 天，请缩短日期范围',
      };
    }
    return {
      ok: false,
      code: 'usage.too_long',
      message: 'Ark 限制查询区间必须小于 31 天，请缩短日期范围',
    };
  }

  return { ok: true, days };
}
