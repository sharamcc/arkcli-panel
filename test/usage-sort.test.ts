import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareUsageRows } from '../src/ark/usage.js';

test('同日按 Hour 数值升序，字符串同样正确', () => {
  const rows = [
    { Day: '2026-10-28', Hour: '10' },
    { Day: '2026-10-28', Hour: '9' },
    { Day: '2026-10-28', Hour: 0 },
  ];
  rows.sort(compareUsageRows);
  assert.deepEqual(
    rows.map((r) => Number(r.Hour)),
    [0, 9, 10],
  );
});

test('跨日按 Day 升序，日模式行为不变', () => {
  const rows = [{ Day: '2026-10-28' }, { Day: '2026-10-27' }];
  rows.sort(compareUsageRows);
  assert.deepEqual(
    rows.map((r) => r.Day),
    ['2026-10-27', '2026-10-28'],
  );
});

test('缺失 Hour 视为 0', () => {
  const rows = [{ Day: '2026-10-28', Hour: 5 }, { Day: '2026-10-28' }];
  rows.sort(compareUsageRows);
  assert.deepEqual(
    rows.map((r) => Number(r.Hour ?? 0)),
    [0, 5],
  );
});
