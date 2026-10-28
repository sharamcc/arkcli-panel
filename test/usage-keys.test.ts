import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hourKeys, usageKey } from '../web/src/usage-keys.js';

test('hourKeys 生成 24 个补零槽位', () => {
  const keys = hourKeys(['2026-10-28']);
  assert.equal(keys.length, 24);
  assert.equal(keys[0], '2026-10-28 00');
  assert.equal(keys[9], '2026-10-28 09');
  assert.equal(keys[23], '2026-10-28 23');
});

test('hourKeys 多天按天展开', () => {
  const keys = hourKeys(['2026-10-27', '2026-10-28']);
  assert.equal(keys.length, 48);
  assert.equal(keys[24], '2026-10-28 00');
});

test('usageKey 日粒度只取 Day', () => {
  assert.equal(usageKey({ Day: '2026-10-28', Hour: 9 }, 'day'), '2026-10-28');
});

test('usageKey 小时粒度兼容数字与字符串 Hour', () => {
  assert.equal(usageKey({ Day: '2026-10-28', Hour: 9 }, 'hour'), '2026-10-28 09');
  assert.equal(usageKey({ Day: '2026-10-28', Hour: '13' }, 'hour'), '2026-10-28 13');
});

test('usageKey 缺失 Hour 按 00 处理', () => {
  assert.equal(usageKey({ Day: '2026-10-28' }, 'hour'), '2026-10-28 00');
});
