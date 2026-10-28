import { useMemo, useRef, useState } from 'react';
import { PerAccountUsage, UsageRow, fetchUsage, shiftDays, todayString } from '../api';
import { usePolling } from '../hooks/usePolling';
import { DailyBars } from '../components/DailyBars';
import { BreakdownTable } from '../components/BreakdownTable';
import { formatShort, formatTokens, useI18n } from '../i18n';
import { Granularity, hourKeys, usageKey } from '../usage-keys';

type RangeKey = 'today' | '3d' | '7d' | '30d' | 'custom';

// Ark 要求区间小于 31 天：开始与结束最多相差 30 天（含首尾共 31 天）
const MAX_SPAN_DAYS = 30;
const MAX_SPAN_DAYS_HOUR = 6;

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
  for (let i = 0; i < 31 && cursor <= end; i += 1) {
    out.push(cursor);
    cursor = shiftDays(cursor, 1);
  }
  return out;
}

export function UsageView() {
  const { t, te, lang } = useI18n();
  const today = todayString();
  const [range, setRange] = useState<RangeKey>('7d');
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [customStart, setCustomStart] = useState(shiftDays(today, -6));
  const [customEnd, setCustomEnd] = useState(today);
  const [data, setData] = useState<PerAccountUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // 日模式最多 31 天（含首尾），小时模式最多 7 天（含首尾）
  const spanLimit = granularity === 'hour' ? MAX_SPAN_DAYS_HOUR : MAX_SPAN_DAYS;

  const handleStartChange = (value: string) => {
    setCustomStart(value);
    const wanted = shiftDays(value, spanLimit);
    const cappedEnd = wanted > today ? today : wanted;
    setCustomEnd(cappedEnd < value ? value : cappedEnd);
  };

  const handleEndChange = (value: string) => {
    setCustomEnd(value);
    const diff = dayDiff(customStart, value);
    if (diff < 0) {
      setCustomStart(value);
    } else if (diff > spanLimit) {
      setCustomStart(shiftDays(value, -spanLimit));
    }
  };

  const { start, end } = useMemo(() => {
    if (range === 'today') return { start: today, end: today };
    if (range === '7d') return { start: shiftDays(today, -6), end: today };
    if (range === '3d') return { start: shiftDays(today, -2), end: today };
    if (range === '30d') return { start: shiftDays(today, -29), end: today };
    return { start: customStart, end: customEnd };
  }, [range, today, customStart, customEnd]);

  const currentKey = `${start}|${end}|${granularity}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const switchGranularity = (next: Granularity) => {
    if (next === granularity) return;
    if (next === 'hour') {
      if (range === '30d') setRange('7d');
      // 自定义区间即使当前未选中，也可能被后续点开，先按结束日收窄到 7 天
      if (dayDiff(customStart, customEnd) > MAX_SPAN_DAYS_HOUR) {
        setCustomStart(shiftDays(customEnd, -MAX_SPAN_DAYS_HOUR));
      }
    }
    if (next === 'day' && range === '3d') setRange('7d');
    setGranularity(next);
  };

  const days = useMemo(() => daysBetween(start, end), [start, end]);

  const load = () => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    const requestKey = currentKey;
    if (requestKey !== loadedKey) {
      setData([]);
      setError(null);
    }
    setLoading(true);
    fetchUsage({ start, end, interval: granularity === 'hour' ? 'Hour' : 'Day' })
      .then((res) => {
        if (seq !== requestSeq.current) return;
        if (res.success && res.data) {
          setData(res.data);
          setError(null);
        } else {
          setData([]);
          setError(te(res.code, res.error));
        }
        setUpdatedAt(
          new Date().toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour12: false }),
        );
      })
      .catch((err: Error) => {
        if (seq === requestSeq.current) setError(err.message);
      })
      .finally(() => {
        if (seq !== requestSeq.current) return;
        setLoadedKey(requestKey);
        setLoading(false);
      });
  };

  usePolling(load, 300_000, `${start}|${end}|${granularity}|${tick}`);

  const okAccounts = data.filter((d) => !d.error);
  const failedAccounts = data.filter((d) => d.error);

  const todayToken = okAccounts.reduce(
    (acc, a) =>
      acc +
      (a.usage ?? [])
        .filter((r) => String(r.Day) === today)
        .reduce((sum, r) => sum + Number(r.TotalTokens ?? 0), 0),
    0,
  );

  const rangeToken = okAccounts.reduce((acc, a) => acc + sumField(a.usage ?? [], 'TotalTokens'), 0);
  const rangeReq = okAccounts.reduce((acc, a) => acc + sumField(a.usage ?? [], 'ReqCnt'), 0);

  const keys = useMemo(() => (granularity === 'day' ? days : hourKeys(days)), [days, granularity]);

  const combinedRows: UsageRow[] = keys.map((key): UsageRow => {
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

  const stale = loadedKey !== currentKey;
  const showPlaceholder = stale || (loading && data.length === 0);
  const value = (n: number) => (showPlaceholder ? '—' : formatTokens(n, lang));

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

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{t('usage.title')}</h1>
          <p className="sub">
            {updatedAt ? t('usage.updatedAt', { time: updatedAt }) : ''}
            {t('usage.subtitle')}
          </p>
        </div>
        <div className="actions">
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
          <div className="seg" role="group" aria-label={t('usage.title')}>
            {ranges.map((r) => (
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
          <button type="button" className="btn btn-primary" onClick={() => setTick((v) => v + 1)}>
            {t('common.refresh')}
          </button>
        </div>
      </header>

      {range === 'custom' && (
        <div className="panel" style={{ marginTop: 0, marginBottom: 12 }}>
          <div className="panel-head">
            <div className="panel-tools">
              <label>
                <span className="sub">{t('usage.custom.start')}</span>
                <input
                  className="input input-sm"
                  type="date"
                  value={customStart}
                  max={today}
                  onChange={(e) => handleStartChange(e.target.value)}
                />
              </label>
              <label>
                <span className="sub">{t('usage.custom.end')}</span>
                <input
                  className="input input-sm"
                  type="date"
                  value={customEnd}
                  max={today}
                  onChange={(e) => handleEndChange(e.target.value)}
                />
              </label>
              <span className="sub">
                {t(granularity === 'hour' ? 'usage.custom.hintHour' : 'usage.custom.hint')}
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

      <section className="kpis" aria-label={t('usage.title')}>
        <div className="kpi">
          <div className="kpi-label">{t('usage.kpi.today')}</div>
          <div className="kpi-value">{value(todayToken)}</div>
          <div className="kpi-note">
            {showPlaceholder
              ? t('usage.querying')
              : formatShort(todayToken, lang) || t('usage.noData')}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            {start === end
              ? t('usage.kpi.rangeSame', { start })
              : t('usage.kpi.range', { start, end })}
          </div>
          <div className="kpi-value">{value(rangeToken)}</div>
          <div className="kpi-note">
            {showPlaceholder
              ? t('usage.querying')
              : formatShort(rangeToken, lang) || t('usage.noData')}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{t('usage.kpi.accounts')}</div>
          <div className="kpi-value">
            {showPlaceholder ? '—' : `${okAccounts.length}/${data.length}`}
          </div>
          <div className="kpi-note">
            {showPlaceholder
              ? t('usage.querying')
              : t('usage.kpi.requests', { n: formatTokens(rangeReq, lang) })}
          </div>
        </div>
      </section>

      <section className="panel" aria-label={t('usage.chart.title')}>
        <div className="panel-head">
          <h2 className="panel-title">
            {t(granularity === 'hour' ? 'usage.chart.titleHour' : 'usage.chart.title')}
          </h2>
          <span className="sub">
            {t(granularity === 'hour' ? 'usage.chart.hintHour' : 'usage.chart.hint')}
          </span>
        </div>
        {showPlaceholder ? (
          <p className="state">{t('common.loading')}</p>
        ) : (
          <>
            <div className="chart-holder">
              <DailyBars rows={combinedRows} days={days} granularity={granularity} />
            </div>
            {rangeToken === 0 && <p className="notice">{t('usage.chart.noUsage')}</p>}
          </>
        )}
      </section>

      <section className="panel" aria-label={t('usage.byAccount')}>
        <div className="panel-head">
          <h2 className="panel-title">{t('usage.byAccount')}</h2>
          <span className="sub">
            {t(granularity === 'hour' ? 'usage.clickHintHour' : 'usage.clickHint')}
          </span>
        </div>

        {showPlaceholder && <p className="state">{t('common.loading')}</p>}
        {!showPlaceholder && data.length === 0 && <p className="state">{t('usage.noAccounts')}</p>}

        {!showPlaceholder &&
          data.map((item) => {
            const rows = item.usage ?? [];
            const acctToday = rows
              .filter((r) => String(r.Day) === today)
              .reduce((sum, r) => sum + Number(r.TotalTokens ?? 0), 0);
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
                    <div className="sub">
                      {item.error
                        ? t('usage.queryFailed')
                        : `${t('common.project')} ${item.project}`}
                    </div>
                  </div>
                  <div className="acct-nums">
                    <span className="num">
                      <span className="num-label">{t('usage.range.today')}</span>
                      {item.error ? '—' : formatTokens(acctToday, lang)}
                    </span>
                    <span className="num">
                      <span className="num-label">{t('usage.rangeLabel')}</span>
                      {item.error ? '—' : formatTokens(acctRange, lang)}
                    </span>
                    <span className="num">
                      <span className="num-label">{t('common.requests')}</span>
                      {item.error ? '—' : formatTokens(acctReq, lang)}
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
                      <p className="empty-hint">{t('usage.row.noUsage')}</p>
                    ) : (
                      <>
                        <div className="chart-meta">
                          <span>
                            {t('common.input')} {formatTokens(sumField(rows, 'InputTokens'), lang)}
                          </span>
                          <span>
                            {t('common.output')}{' '}
                            {formatTokens(sumField(rows, 'OutputTokens'), lang)}
                          </span>
                          <span>
                            {t('common.cache')}{' '}
                            {formatTokens(sumField(rows, 'CacheTokensHit'), lang)}
                          </span>
                          <span>
                            {t('common.requests')} {formatTokens(sumField(rows, 'ReqCnt'), lang)}
                          </span>
                        </div>
                        <DailyBars rows={rows} days={days} granularity={granularity} />
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

        {!showPlaceholder && failedAccounts.length > 0 && (
          <p className="notice">{t('usage.failed', { n: failedAccounts.length })}</p>
        )}
      </section>
    </>
  );
}
