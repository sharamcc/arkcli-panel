import assert from 'node:assert/strict';
import test from 'node:test';
import { shiftDays } from '../web/src/api.js';

test('shiftDays 对空串和非法日期提前返回，不抛 RangeError', () => {
  assert.equal(shiftDays('', 3), '');
  assert.equal(shiftDays('bad-date', 3), 'bad-date');
  assert.equal(shiftDays('2026-02-31', 3), '2026-02-31');
  assert.equal(shiftDays('2026-13-01', 3), '2026-13-01');
});

test('shiftDays 正常日期仍正确平移', () => {
  assert.equal(shiftDays('2026-01-01', 1), '2026-01-02');
  assert.equal(shiftDays('2026-01-01', -1), '2025-12-31');
});
