import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDateRange, parseStrictDate } from '../src/utils/date-range.js';

test('严格日期校验：闰年 2/29 合法，滚动日期与非法月份被拒', () => {
  assert.notEqual(parseStrictDate('2028-02-29'), null);
  assert.equal(parseStrictDate('2026-02-29'), null);
  assert.equal(parseStrictDate('2026-02-30'), null);
  assert.equal(parseStrictDate('2026-02-31'), null);
  assert.equal(parseStrictDate('2026-13-01'), null);
  assert.equal(parseStrictDate('2026-00-10'), null);
});

test('日模式 31 天通过，32 天拒绝', () => {
  assert.equal(parseDateRange('2026-01-01', '2026-01-31', 'Day').ok, true);
  assert.deepEqual(parseDateRange('2026-01-01', '2026-02-01', 'Day'), {
    ok: false,
    code: 'usage.too_long',
    message: 'Ark 限制查询区间必须小于 31 天，请缩短日期范围',
  });
});

test('小时模式 7 天通过，8 天拒绝', () => {
  assert.equal(parseDateRange('2026-01-01', '2026-01-07', 'Hour').ok, true);
  assert.deepEqual(parseDateRange('2026-01-01', '2026-01-08', 'Hour'), {
    ok: false,
    code: 'usage.hour_too_long',
    message: '小时模式最多查询 7 天，请缩短日期范围',
  });
});

test('结束早于开始返回 invalid_range', () => {
  assert.deepEqual(parseDateRange('2026-01-02', '2026-01-01', 'Day'), {
    ok: false,
    code: 'usage.invalid_range',
    message: '结束日期不能早于开始日期',
  });
});
