import { useMemo, useState } from 'react';
import {
  PerAccountUsage,
  UsageRow,
  fetchUsage,
  formatTokens,
  formatTokensShort,
  shiftDays,
  todayString,
} from '../api';
import { usePolling } from '../hooks/usePolling';
import { DailyBars } from '../components/DailyBars';
import { BreakdownTable } from '../components/BreakdownTable';

type RangeKey = 'today' | '7d' | '30d' | 'custom';

const RANGES: { id: RangeKey; label: string }[] = [
  { id: 'today', label: '今日' },
  { id: '7d', label: '近 7 天' },
  { id: '30d', label: '近 30 天' },
  { id: 'custom', label: '自定义' },
];

// Ark 要求区间小于 31 天：开始与结束最多相差 30 天（含首尾共 31 天）
const MAX_SPAN_DAYS = 30;

function dayDiff(start: string, end: string): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000,
  );
}

function sumField(rows: UsageRow[], field: string): number {
  return rows.reduce((acc, r) => acc + Number(r[field] ?? 0), 0);
}

function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let cursor = start;
  // 上限防御：Ark 只接受小于 31 天的区间
  for (let i = 0; i < 31 && cursor <= end; i += 1) {
    out.push(cursor);
    cursor = shiftDays(cursor, 1);
  }
  return out;
}

export function UsageView() {
  const today = todayString();
  const [range, setRange] = useState<RangeKey>('7d');
  const [customStart, setCustomStart] = useState(shiftDays(today, -6));
  const [customEnd, setCustomEnd] = useState(today);
  const [data, setData] = useState<PerAccountUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // 选定开始日期后，结束日期自动设为 31 天窗口（含首尾），且不超过今天
  const handleStartChange = (value: string) => {
    setCustomStart(value);
    const wanted = shiftDays(value, MAX_SPAN_DAYS);
    const cappedEnd = wanted > today ? today : wanted;
    setCustomEnd(cappedEnd < value ? value : cappedEnd);
  };

  // 结束日期反向约束：早于开始则同步开始，跨度超限则前移开始
  const handleEndChange = (value: string) => {
    setCustomEnd(value);
    const diff = dayDiff(customStart, value);
    if (diff < 0) {
      setCustomStart(value);
    } else if (diff > MAX_SPAN_DAYS) {
      setCustomStart(shiftDays(value, -MAX_SPAN_DAYS));
    }
  };

  const { start, end } = useMemo(() => {
    if (range === 'today') return { start: today, end: today };
    if (range === '7d') return { start: shiftDays(today, -6), end: today };
    if (range === '30d') return { start: shiftDays(today, -29), end: today };
    return { start: customStart, end: customEnd };
  }, [range, today, customStart, customEnd]);

  const days = useMemo(() => daysBetween(start, end), [start, end]);

  const load = () => {
    setLoading(true);
    fetchUsage({ start, end, interval: 'Day' })
      .then((res) => {
        if (res.success && res.data) {
          setData(res.data);
          setError(null);
        } else {
          setData([]);
          setError(typeof res.error === 'string' ? res.error : '查询失败');
        }
        setUpdatedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  usePolling(load, 300_000, `${start}|${end}|${tick}`);

  const okAccounts = data.filter((d) => !d.error);
  const failedAccounts = data.filter((d) => d.error);

  const todayToken = okAccounts.reduce((acc, a) => {
    const row = (a.usage ?? []).find((r) => String(r.Day) === today);
    return acc + Number(row?.TotalTokens ?? 0);
  }, 0);

  const rangeToken = okAccounts.reduce((acc, a) => acc + sumField(a.usage ?? [], 'TotalTokens'), 0);
  const rangeReq = okAccounts.reduce((acc, a) => acc + sumField(a.usage ?? [], 'ReqCnt'), 0);

  // 全部账户逐日合计，用于总览趋势图
  const combinedRows: UsageRow[] = days.map((day) => {
    let total = 0;
    let input = 0;
    let output = 0;
    let cache = 0;
    let req = 0;
    for (const a of okAccounts) {
      const row = (a.usage ?? []).find((r) => String(r.Day) === day);
      if (!row) continue;
      total += Number(row.TotalTokens ?? 0);
      input += Number(row.InputTokens ?? 0);
      output += Number(row.OutputTokens ?? 0);
      cache += Number(row.CacheTokensHit ?? 0);
      req += Number(row.ReqCnt ?? 0);
    }
    return {
      Day: day,
      TotalTokens: total,
      InputTokens: input,
      OutputTokens: output,
      CacheTokensHit: cache,
      ReqCnt: req,
    };
  });

  const showPlaceholder = loading && data.length === 0;
  const value = (n: number) => (showPlaceholder ? '—' : formatTokens(n));

  return (
    <>
      <header className="page-head">
        <div>
          <h1>用量</h1>
          <p className="sub">
            {updatedAt ? `更新于 ${updatedAt} · ` : ''}数据来自 Ark，延迟 5–30 分钟
          </p>
        </div>
        <div className="actions">
          <div className="seg" role="group" aria-label="时间范围">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                className={range === r.id ? 'active' : ''}
                aria-pressed={range === r.id}
                onClick={() => setRange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setTick((t) => t + 1)}>
            刷新
          </button>
        </div>
      </header>

      {range === 'custom' && (
        <div className="panel" style={{ marginTop: 0, marginBottom: 12 }}>
          <div className="panel-head">
            <div className="panel-tools">
              <label>
                <span className="sub">开始</span>
                <input
                  className="input input-sm"
                  type="date"
                  value={customStart}
                  max={today}
                  onChange={(e) => handleStartChange(e.target.value)}
                />
              </label>
              <label>
                <span className="sub">结束</span>
                <input
                  className="input input-sm"
                  type="date"
                  value={customEnd}
                  max={today}
                  onChange={(e) => handleEndChange(e.target.value)}
                />
              </label>
              <span className="sub">
                选定开始日期后自动取 31 天窗口，最长不超过 31 天（含首尾）
              </span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="panel">
          <p className="notice">{error}</p>
        </div>
      )}

      <section className="kpis" aria-label="用量总览">
        <div className="kpi">
          <div className="kpi-label">今日 token</div>
          <div className="kpi-value">{value(todayToken)}</div>
          <div className="kpi-note">
            {showPlaceholder ? '正在查询' : formatTokensShort(todayToken) || '暂无数据'}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{start === end ? start : `${start} 至 ${end}`} 合计</div>
          <div className="kpi-value">{value(rangeToken)}</div>
          <div className="kpi-note">
            {showPlaceholder ? '正在查询' : formatTokensShort(rangeToken) || '暂无数据'}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">账户</div>
          <div className="kpi-value">
            {showPlaceholder ? '—' : `${okAccounts.length}/${data.length}`}
          </div>
          <div className="kpi-note">
            {showPlaceholder ? '正在查询' : `区间请求 ${formatTokens(rangeReq)} 次`}
          </div>
        </div>
      </section>

      <section className="panel" aria-label="全部账户逐日趋势">
        <div className="panel-head">
          <h2 className="panel-title">全部账户 · 逐日总 token</h2>
          <span className="sub">按天合计，悬停查看输入与输出</span>
        </div>
        {showPlaceholder ? (
          <p className="state">正在查询…</p>
        ) : (
          <>
            <div className="chart-holder">
              <DailyBars rows={combinedRows} days={days} />
            </div>
            {rangeToken === 0 && (
              <p className="notice">该区间没有用量记录（Ark 只在有调用时产生数据）。</p>
            )}
          </>
        )}
      </section>

      <section className="panel" aria-label="账户用量">
        <div className="panel-head">
          <h2 className="panel-title">按账户</h2>
          <span className="sub">点击账户查看逐日明细</span>
        </div>

        {loading && data.length === 0 && <p className="state">正在查询…</p>}
        {!loading && data.length === 0 && <p className="state">还没有配置任何账户</p>}

        {data.map((item) => {
          const rows = item.usage ?? [];
          const acctToday = Number(rows.find((r) => String(r.Day) === today)?.TotalTokens ?? 0);
          const acctRange = sumField(rows, 'TotalTokens');
          const acctReq = sumField(rows, 'ReqCnt');
          const isOpen = expanded === item.account;

          return (
            <div key={item.account}>
              <div
                className="acct-row"
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onClick={() => setExpanded(isOpen ? null : item.account)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpanded(isOpen ? null : item.account);
                  }
                }}
              >
                <span
                  className={`status-dot ${item.error ? 'error' : rows.length === 0 ? 'idle' : ''}`}
                  aria-hidden="true"
                />
                <div className="acct-identity">
                  <div className="acct-name">{item.account}</div>
                  <div className="sub">{item.error ? '查询失败' : `项目 ${item.project}`}</div>
                </div>
                <div className="acct-nums">
                  <span className="num">
                    <span className="num-label">今日</span>
                    {item.error ? '—' : formatTokens(acctToday)}
                  </span>
                  <span className="num">
                    <span className="num-label">区间</span>
                    {item.error ? '—' : formatTokens(acctRange)}
                  </span>
                  <span className="num">
                    <span className="num-label">请求</span>
                    {item.error ? '—' : formatTokens(acctReq)}
                  </span>
                </div>
                <span className="chevron" aria-hidden="true">
                  {isOpen ? '−' : '+'}
                </span>
              </div>

              {isOpen && item.error && (
                <div className="row-expand">
                  <p className="error-line">{item.error}</p>
                </div>
              )}

              {isOpen && !item.error && (
                <div className="row-expand">
                  {rows.length === 0 ? (
                    <p className="empty-hint">该区间没有用量记录（Ark 只在有调用时产生数据）。</p>
                  ) : (
                    <>
                      <div className="chart-meta">
                        <span>输入 {formatTokens(sumField(rows, 'InputTokens'))}</span>
                        <span>输出 {formatTokens(sumField(rows, 'OutputTokens'))}</span>
                        <span>缓存命中 {formatTokens(sumField(rows, 'CacheTokensHit'))}</span>
                        <span>请求 {formatTokens(sumField(rows, 'ReqCnt'))}</span>
                      </div>
                      <DailyBars rows={rows} days={days} />
                    </>
                  )}
                  <BreakdownTable
                    account={item.account}
                    start={start}
                    end={end}
                    days={days}
                    refreshToken={updatedAt ?? ''}
                  />
                </div>
              )}
            </div>
          );
        })}

        {failedAccounts.length > 0 && (
          <p className="notice">{failedAccounts.length} 个账户未取到数据，展开可查看原因。</p>
        )}
      </section>
    </>
  );
}
