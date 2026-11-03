import assert from 'node:assert/strict';
import test from 'node:test';
import { formatShort } from '../web/src/i18n.js';

test('formatShort 只有 0 显示无数据，1 万以下正常显示数值', () => {
  assert.equal(formatShort(0, 'zh'), '');
  assert.equal(formatShort(0, 'en'), '');
  assert.equal(formatShort(5_000, 'zh'), '5,000');
  assert.equal(formatShort(9_999, 'en'), '9,999');
  assert.equal(formatShort(10_000, 'zh'), '约 1.0 万');
});

test('formatShort 英文百万/十亿阈值正确', () => {
  assert.equal(formatShort(15_000, 'en'), '~15.0K');
  assert.equal(formatShort(1_000_000, 'en'), '~1.0M');
  assert.equal(formatShort(100_000_000, 'en'), '~100M');
  assert.equal(formatShort(1_000_000_000, 'en'), '~1.0B');
});

test('formatShort 四舍五入到下一单位时正确进位', () => {
  assert.equal(formatShort(999_950, 'en'), '~1.0M');
  assert.equal(formatShort(999_999_999, 'en'), '~1.0B');
  assert.equal(formatShort(99_999_999, 'zh'), '约 1.00 亿');
  assert.equal(formatShort(1_000_000_000, 'en'), '~1.0B');
});

test('formatShort 负数与 0 在两种语言下稳定', () => {
  assert.equal(formatShort(0, 'zh'), '');
  assert.equal(formatShort(0, 'en'), '');
  assert.equal(formatShort(5_000, 'zh'), '5,000');
  assert.equal(formatShort(5_000, 'en'), '5,000');
  assert.equal(formatShort(-5_000, 'zh'), '-5,000');
  assert.equal(formatShort(-5_000, 'en'), '-5,000');
});
