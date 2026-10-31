# 用量页小时统计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用量页新增「日 / 小时」粒度切换，按小时展示 token 用量，图表与 KPI 口径一致。

**Architecture:** 后端 `GetInferenceUsage` 已支持 `interval=Hour`，仅需修正排序；前端新增纯函数生成小时槽位与行 key，`DailyBars` 增加可选粒度参数，`UsageView` 负责范围约束、聚合与 KPI 求和。

**Tech Stack:** React 19 + TypeScript、Vite、Fastify 后端、node:test、Docker Compose 部署。

**Git 规则（覆盖本计划提交步骤）：** 每个提交步骤执行前必须获得用户明确同意；禁止 `git add -A`；禁止 `--no-verify`；全部改动经 PR Squash 合入 `main`。

**进度（2026-10-31）：** Task 1–6 已完成，随 PR #3（`a89a2af`）合入 `main`；`usage-keys.ts`、`compareUsageRows`、`DailyBars` 粒度参数、`UsageView` 接线与中英文案均已就位，CI 全绿。本地浏览器验证、线上数据一致性校验、部署与线上验收未在仓库留痕，对应步骤保持未勾选。

---

## 文件结构

| 文件                               | 职责                                |
| ---------------------------------- | ----------------------------------- |
| `web/src/usage-keys.ts`            | 粒度类型、小时槽位与行 key 的纯函数 |
| `test/usage-keys.test.ts`          | 上述纯函数的单元测试                |
| `src/ark/usage.ts`                 | Ark 用量行排序（Day + Hour）        |
| `test/usage-sort.test.ts`          | 排序比较器单元测试                  |
| `web/src/i18n.tsx`                 | 新增粒度与小时相关中英文案          |
| `web/src/components/DailyBars.tsx` | 逐日/逐小时柱状图                   |
| `web/src/views/UsageView.tsx`      | 粒度切换、范围约束、聚合、KPI       |
| `README.md` / `README.en.md`       | 功能列表补充小时统计                |

---

### Task 1: 小时槽位纯函数（TDD）

**Files:**

- Create: `web/src/usage-keys.ts`
- Create: `test/usage-keys.test.ts`

- [x] **Step 1: 写失败测试**

创建 `test/usage-keys.test.ts`：

```ts
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
```

- [x] **Step 2: 运行测试确认失败**

Run: `npm test`

Expected: FAIL，报 `Cannot find module` 指向 `web/src/usage-keys`。

- [x] **Step 3: 实现纯函数**

创建 `web/src/usage-keys.ts`：

```ts
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
```

- [x] **Step 4: 运行测试确认通过**

Run: `npm test`

Expected: PASS，测试总数由 16 增至 21。

- [x] **Step 5: 格式化与静态检查**

Run: `npx prettier --write web/src/usage-keys.ts test/usage-keys.test.ts && npm run lint && npm run typecheck`

Expected: 无报错。

- [x] **Step 6: 提交（需用户确认）**

```bash
git add web/src/usage-keys.ts test/usage-keys.test.ts
git commit -m "feat: 增加用量小时槽位纯函数"
```

---

### Task 2: Ark 用量行排序修正（TDD）

**Files:**

- Modify: `src/ark/usage.ts:89-91`
- Create: `test/usage-sort.test.ts`

- [x] **Step 1: 写失败测试**

创建 `test/usage-sort.test.ts`：

```ts
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
```

- [x] **Step 2: 运行测试确认失败**

Run: `npm test`

Expected: FAIL，`compareUsageRows` 未导出。

- [x] **Step 3: 实现比较器并替换排序**

`src/ark/usage.ts` 在 `fetchUsageRows` 之前新增：

```ts
export function compareUsageRows(a: UsageRow, b: UsageRow): number {
  const day = String(a.Day ?? '').localeCompare(String(b.Day ?? ''));
  if (day !== 0) return day;
  return Number(a.Hour ?? 0) - Number(b.Hour ?? 0);
}
```

并把原第 90 行的：

```ts
rows.sort((a, b) => String(a.Day ?? '').localeCompare(String(b.Day ?? '')));
```

替换为：

```ts
rows.sort(compareUsageRows);
```

- [x] **Step 4: 运行测试确认通过**

Run: `npm test`

Expected: PASS，全部用例通过。

- [x] **Step 5: 质量门**

Run: `npx prettier --write src/ark/usage.ts test/usage-sort.test.ts && npm run lint && npm run typecheck`

Expected: 无报错。

- [x] **Step 6: 提交（需用户确认）**

```bash
git add src/ark/usage.ts test/usage-sort.test.ts
git commit -m "fix: 用量行按日期与小时稳定排序"
```

---

### Task 3: 中英文案

**Files:**

- Modify: `web/src/i18n.tsx`

- [x] **Step 1: 中文文案**

在中文词典的 `'usage.range.custom': '自定义',` 之后新增：

```ts
  'usage.range.3d': '近 3 天',
  'usage.granularity.label': '统计粒度',
  'usage.granularity.day': '日',
  'usage.granularity.hour': '小时',
  'usage.custom.hintHour': '小时模式最多查询 7 天（含首尾），选定开始日期后自动取 7 天窗口',
```

在 `'usage.chart.hint': '按天合计，悬停查看输入与输出',` 之后新增：

```ts
  'usage.chart.titleHour': '全部账户 · 逐小时总 token',
  'usage.chart.hintHour': '按 Ark 返回的小时合计，未做时区换算；悬停查看输入与输出',
```

在 `'usage.clickHint': '点击账户查看逐日明细',` 之后新增：

```ts
  'usage.clickHintHour': '点击账户查看逐小时明细',
```

在 `'chart.tooltip': ...` 之后新增：

```ts
  'chart.titleHour': '每小时总 token',
  'chart.hours': '{n} 小时',
  'chart.ariaHour': '每小时 token 用量柱状图',
```

- [x] **Step 2: 英文文案**

在英文词典的 `'usage.range.custom': 'Custom',` 之后新增：

```ts
  'usage.range.3d': 'Last 3 days',
  'usage.granularity.label': 'Granularity',
  'usage.granularity.day': 'Day',
  'usage.granularity.hour': 'Hour',
  'usage.custom.hintHour': 'Hourly mode allows up to 7 days (inclusive); picking a start date fills a 7-day window',
```

在 `'usage.chart.hint': 'Summed per day; hover for input and output',` 之后新增：

```ts
  'usage.chart.titleHour': 'All accounts · hourly tokens',
  'usage.chart.hintHour': 'Summed per Ark hour (no timezone conversion); hover for input and output',
```

在 `'usage.clickHint': 'Select an account for daily detail',` 之后新增：

```ts
  'usage.clickHintHour': 'Select an account for hourly detail',
```

在英文 `'chart.tooltip': ...` 之后新增：

```ts
  'chart.titleHour': 'Hourly total tokens',
  'chart.hours': '{n} hours',
  'chart.ariaHour': 'Hourly token usage bar chart',
```

- [x] **Step 3: 格式检查**

Run: `npx prettier --write web/src/i18n.tsx && npm run lint && npm run typecheck`

Expected: 无报错。

- [x] **Step 4: 提交（需用户确认）**

```bash
git add web/src/i18n.tsx
git commit -m "feat: 增加用量小时粒度文案"
```

---

### Task 4: 图表支持小时粒度

**Files:**

- Modify: `web/src/components/DailyBars.tsx`（整文件替换）

- [x] **Step 1: 替换组件实现**

`web/src/components/DailyBars.tsx` 整体改为：

```tsx
import { useState } from 'react';
import { UsageRow } from '../api';
import { Granularity, hourKeys, usageKey } from '../usage-keys';
import { formatTokens, useI18n } from '../i18n';

type Props = {
  rows: UsageRow[];
  days: string[];
  granularity?: Granularity;
};

// 逐日/逐小时柱状图：每根柱一个时间槽位，唯一图表色；数值用完整千分位
export function DailyBars({ rows, days, granularity = 'day' }: Props) {
  const { t, lang } = useI18n();
  const [hovered, setHovered] = useState<number | null>(null);
  const keys = granularity === 'day' ? days : hourKeys(days);
  const byKey = new Map(rows.map((r) => [usageKey(r, granularity), r]));
  const values = keys.map((k) => Number(byKey.get(k)?.TotalTokens ?? 0));
  const max = Math.max(...values, 1);

  const W = 720;
  const H = 140;
  const padBottom = 18;
  const chartH = H - padBottom;
  const slot = W / Math.max(keys.length, 1);
  const barW = Math.max(Math.min(slot * 0.62, 28), 3);

  const ticks = [0, max / 2, max];

  const labelIndexes =
    granularity === 'day'
      ? keys
          .map((_, i) => i)
          .filter(
            (i) => i === 0 || i === keys.length - 1 || i === Math.floor((keys.length - 1) / 2),
          )
      : keys.length <= 24
        ? [0, 6, 12, 18, 23]
        : keys.map((k, i) => (k.endsWith(' 00') ? i : -1)).filter((i) => i >= 0);

  const labelText = (key: string) => {
    if (granularity === 'day') return key.slice(5);
    if (keys.length <= 24) return `${key.slice(11)}:00`;
    return key.slice(5, 10);
  };

  const displayKey = (key: string) => (granularity === 'day' ? key : `${key.slice(5)}:00`);

  return (
    <div className="chart-block">
      <div className="chart-meta">
        <span>{t(granularity === 'hour' ? 'chart.titleHour' : 'chart.title')}</span>
        <span>
          {t(granularity === 'hour' ? 'chart.hours' : 'chart.days', {
            n: granularity === 'hour' ? keys.length : days.length,
          })}
        </span>
      </div>
      <svg
        className="chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t(granularity === 'hour' ? 'chart.ariaHour' : 'chart.aria')}
      >
        {ticks.map((tick, i) => {
          const y = chartH - (tick / max) * chartH;
          return (
            <g key={i}>
              <line className="grid-line" x1={0} x2={W} y1={y} y2={y} />
              <text className="axis-text" x={2} y={Math.max(y - 4, 8)}>
                {formatTokens(Math.round(tick), lang)}
              </text>
            </g>
          );
        })}
        {keys.map((key, i) => {
          const value = values[i];
          const h = (value / max) * chartH;
          const x = i * slot + (slot - barW) / 2;
          const y = chartH - h;
          const row = byKey.get(key);
          const tooltip = t('chart.tooltip', {
            day: displayKey(key),
            total: formatTokens(value, lang),
            input: formatTokens(Number(row?.InputTokens ?? 0), lang),
            output: formatTokens(Number(row?.OutputTokens ?? 0), lang),
            requests: formatTokens(Number(row?.ReqCnt ?? 0), lang),
          });
          return (
            <g key={key} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
              <rect
                className={value > 0 ? 'bar' : 'bar-zero'}
                x={x}
                y={value > 0 ? y : chartH - 1}
                width={barW}
                height={value > 0 ? Math.max(h, 1.5) : 1.5}
                rx={1}
                opacity={hovered === null || hovered === i ? 1 : 0.55}
              >
                <title>{tooltip}</title>
              </rect>
            </g>
          );
        })}
        {labelIndexes.map((i, order) => (
          <text
            key={`label-${keys[i]}`}
            className="axis-text"
            x={i * slot + slot / 2}
            y={H - 4}
            textAnchor={
              order === 0 ? 'start' : order === labelIndexes.length - 1 ? 'end' : 'middle'
            }
          >
            {labelText(keys[i])}
          </text>
        ))}
      </svg>
    </div>
  );
}
```

- [x] **Step 2: 编译检查**

Run: `npm run typecheck && npm run lint`

Expected: 无报错；`BreakdownTable` 的 `<DailyBars rows={ep.daily} days={days} />` 仍走默认 `day`。

- [x] **Step 3: 提交（需用户确认）**

```bash
git add web/src/components/DailyBars.tsx
git commit -m "feat: 柱状图支持逐小时粒度"
```

---

### Task 5: 用量页接线

**Files:**

- Modify: `web/src/views/UsageView.tsx`

- [x] **Step 1: 导入与常量**

把首部导入改为：

```tsx
import { useMemo, useState } from 'react';
import { PerAccountUsage, UsageRow, fetchUsage, shiftDays, todayString } from '../api';
import { usePolling } from '../hooks/usePolling';
import { DailyBars } from '../components/DailyBars';
import { BreakdownTable } from '../components/BreakdownTable';
import { formatShort, formatTokens, useI18n } from '../i18n';
import { Granularity, hourKeys, usageKey } from '../usage-keys';
```

把类型与常量改为：

```tsx
type RangeKey = 'today' | '3d' | '7d' | '30d' | 'custom';

// Ark 要求区间小于 31 天：开始与结束最多相差 30 天（含首尾共 31 天）
const MAX_SPAN_DAYS = 30;
// 小时模式最多 7 天，共 168 个槽位
const MAX_SPAN_DAYS_HOUR = 6;
```

- [x] **Step 2: 状态与范围处理**

在 `const [range, setRange] = useState<RangeKey>('7d');` 之后新增：

```tsx
const [granularity, setGranularity] = useState<Granularity>('day');
```

`handleStartChange` / `handleEndChange` 之前新增一次：

```tsx
// 日模式最多 31 天（含首尾），小时模式最多 7 天（含首尾）
const spanLimit = granularity === 'hour' ? MAX_SPAN_DAYS_HOUR : MAX_SPAN_DAYS;
```

并把两处 `shiftDays(value, MAX_SPAN_DAYS)` 与 `diff > MAX_SPAN_DAYS` 改为使用 `spanLimit`。

`start/end` 的 `useMemo` 增加一项：

```tsx
if (range === '3d') return { start: shiftDays(today, -2), end: today };
```

在 `start/end` 的 `useMemo` 之后新增切换函数：

```tsx
const switchGranularity = (next: Granularity) => {
  if (next === granularity) return;
  if (next === 'hour' && dayDiff(start, end) > MAX_SPAN_DAYS_HOUR) {
    setRange('7d');
    setCustomStart(shiftDays(today, -6));
    setCustomEnd(today);
  }
  if (next === 'day' && range === '3d') setRange('7d');
  setGranularity(next);
};
```

- [x] **Step 3: 请求参数与轮询 key**

`load` 中改为：

```tsx
fetchUsage({ start, end, interval: granularity === 'hour' ? 'Hour' : 'Day' });
```

`usePolling` 的 key 改为：

```tsx
usePolling(load, 300_000, `${start}|${end}|${granularity}|${tick}`);
```

- [x] **Step 4: 聚合与今日 KPI**

把 `todayToken` 的 `find` 实现替换为按天求和：

```tsx
const todayToken = okAccounts.reduce(
  (acc, a) =>
    acc +
    (a.usage ?? [])
      .filter((r) => String(r.Day) === today)
      .reduce((sum, r) => sum + Number(r.TotalTokens ?? 0), 0),
  0,
);
```

把原 `combinedRows` 的构造替换为：

```tsx
const keys = useMemo(() => (granularity === 'day' ? days : hourKeys(days)), [days, granularity]);

const combinedRows: UsageRow[] = keys.map((key) => {
  let total = 0;
  let input = 0;
  let output = 0;
  let cache = 0;
  let req = 0;
  for (const a of okAccounts) {
    const row = (a.usage ?? []).find((r) => usageKey(r, granularity) === key);
    if (!row) continue;
    total += Number(row.TotalTokens ?? 0);
    input += Number(row.InputTokens ?? 0);
    output += Number(row.OutputTokens ?? 0);
    cache += Number(row.CacheTokensHit ?? 0);
    req += Number(row.ReqCnt ?? 0);
  }
  const [day, hour] = key.split(' ');
  return granularity === 'day'
    ? {
        Day: key,
        TotalTokens: total,
        InputTokens: input,
        OutputTokens: output,
        CacheTokensHit: cache,
        ReqCnt: req,
      }
    : {
        Day: day,
        Hour: Number(hour),
        TotalTokens: total,
        InputTokens: input,
        OutputTokens: output,
        CacheTokensHit: cache,
        ReqCnt: req,
      };
});
```

把账户行的 `acctToday` 替换为：

```tsx
const acctToday = rows
  .filter((r) => String(r.Day) === today)
  .reduce((sum, r) => sum + Number(r.TotalTokens ?? 0), 0);
```

- [x] **Step 5: 范围选项与粒度控件**

把 `ranges` 定义替换为：

```tsx
const ranges: { id: RangeKey; label: string }[] =
  granularity === 'day'
    ? [
        { id: 'today', label: t('usage.range.today') },
        { id: '7d', label: t('usage.range.7d') },
        { id: '30d', label: t('usage.range.30d') },
        { id: 'custom', label: t('usage.range.custom') },
      ]
    : [
        { id: 'today', label: t('usage.range.today') },
        { id: '3d', label: t('usage.range.3d') },
        { id: '7d', label: t('usage.range.7d') },
        { id: 'custom', label: t('usage.range.custom') },
      ];
```

在页头 `.actions` 内、范围分段控件之前插入：

```tsx
<div className="seg" role="group" aria-label={t('usage.granularity.label')}>
  <button
    type="button"
    className={granularity === 'day' ? 'active' : ''}
    aria-pressed={granularity === 'day'}
    onClick={() => switchGranularity('day')}
  >
    {t('usage.granularity.day')}
  </button>
  <button
    type="button"
    className={granularity === 'hour' ? 'active' : ''}
    aria-pressed={granularity === 'hour'}
    onClick={() => switchGranularity('hour')}
  >
    {t('usage.granularity.hour')}
  </button>
</div>
```

- [x] **Step 6: 图表与文案接线**

自定义范围提示改为：

```tsx
<span className="sub">
  {t(granularity === 'hour' ? 'usage.custom.hintHour' : 'usage.custom.hint')}
</span>
```

总览图标题与提示改为：

```tsx
          <h2 className="panel-title">
            {t(granularity === 'hour' ? 'usage.chart.titleHour' : 'usage.chart.title')}
          </h2>
          <span className="sub">
            {t(granularity === 'hour' ? 'usage.chart.hintHour' : 'usage.chart.hint')}
          </span>
```

总览图调用改为：

```tsx
<DailyBars rows={combinedRows} days={days} granularity={granularity} />
```

账户区提示改为：

```tsx
<span className="sub">{t(granularity === 'hour' ? 'usage.clickHintHour' : 'usage.clickHint')}</span>
```

账户展开图调用改为：

```tsx
<DailyBars rows={rows} days={days} granularity={granularity} />
```

- [x] **Step 7: 质量门**

Run: `npx prettier --write web/src/views/UsageView.tsx && npm run lint && npm run typecheck && npm test && npm run build`

Expected: 全部通过。

- [x] **Step 8: 提交（需用户确认）**

```bash
git add web/src/views/UsageView.tsx
git commit -m "feat: 用量页支持日与小时粒度切换"
```

---

### Task 6: README 功能说明

**Files:**

- Modify: `README.md:9`
- Modify: `README.en.md` 对应行

- [x] **Step 1: 中文**

`README.md` 第 9 行改为：

```markdown
- **用量**：账户级汇总、逐日 / 逐小时柱状图、按接入点 / 按模型拆分
```

- [x] **Step 2: 英文**

`README.en.md` 对应条目改为：

```markdown
- **Usage**: per-account totals, daily/hourly bar charts, breakdown by endpoint and model
```

- [x] **Step 3: 格式检查**

Run: `npx prettier --check README.md README.en.md`

Expected: 通过。

- [x] **Step 4: 提交（需用户确认）**

```bash
git add README.md README.en.md
git commit -m "docs: 说明用量支持逐小时统计"
```

---

### Task 7: 端到端验证与部署

- [x] **Step 1: 本地质量门**

Run: `npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`

Expected: 全绿。

- [ ] **Step 2: 本地启动并浏览器验证**

```bash
PORT=3100 PANEL_HOST=127.0.0.1 node dist/index.js
```

浏览器验证：

- 日模式下图表、KPI 与改造前一致
- 切到小时：单日出现 24 根柱，tooltip 为 `MM-DD HH:00`
- 切到近 7 天：168 根柱，横轴按天
- 从日模式「近 30 天」切到小时：自动变为近 7 天
- 账户展开图与顶部图粒度一致
- 明细表仍按日

- [ ] **Step 3: 数据一致性校验（关键不变量）**

```bash
ssh arkcli-panel 'cd /opt/arkcli-panel && \
  day=$(curl -s "http://127.0.0.1/api/usage?start=2026-10-27&end=2026-10-27&interval=Day" | jq "[.data[].usage[]?.TotalTokens] | add") && \
  hour=$(curl -s "http://127.0.0.1/api/usage?start=2026-10-27&end=2026-10-27&interval=Hour" | jq "[.data[].usage[]?.TotalTokens] | add") && \
  echo "day=$day hour=$hour"'
```

Expected: `day` 与 `hour` 数值相等（无数据时都为 `null`）。

- [x] **Step 4: 提交、PR、CI（需用户确认）**

```bash
git switch -c feat/hourly-usage
git add <本计划涉及的文件>
git commit -m "feat: 用量页支持逐小时统计"
git push -u origin feat/hourly-usage
gh pr create --base main --head feat/hourly-usage --title "feat: 用量页支持逐小时统计"
gh pr checks --watch
```

Expected: Node 20 / Node 22 / Docker 三个 job 全绿。

- [ ] **Step 5: Squash 合并与部署（需用户确认）**

```bash
gh pr merge <PR编号> --squash --delete-branch
git switch main && git pull --ff-only
```

```bash
ssh arkcli-panel 'cd /opt/arkcli-panel && git pull --ff-only && docker compose up -d --build && docker compose restart nginx && sleep 20 && docker compose ps'
```

Expected: app healthy、nginx running、`/health` 200。

- [ ] **Step 6: 线上浏览器验收**

打开 `http://192.168.9.211`，按 Task 7 Step 2 的清单复验；确认小时视图、tooltip、范围联动与账户展开均正常。

---

## Self-Review

- **Spec coverage：** 交互（Task 5）、范围约束（Task 5）、图表（Task 4）、聚合与 KPI（Task 5）、排序（Task 2）、文案（Task 3）、README（Task 6）、验收与部署（Task 7）逐项覆盖。
- **Placeholder scan：** 无 TBD/TODO；`<PR编号>` 与 `<本计划涉及的文件>` 为执行期参数，非缺失内容。
- **Type consistency：** `Granularity`、`hourKeys`、`usageKey` 在 Task 1 定义，Task 4/5 同名导入；`compareUsageRows` 在 Task 2 定义并使用；`DailyBars` 的 `granularity` 可选，`BreakdownTable` 不传保持默认。
- **已知取舍：** 小时模式上限由前端约束（7 天），后端仍保留 31 天校验；时区不做换算。
