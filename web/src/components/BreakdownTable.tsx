import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  BreakdownEndpoint,
  BreakdownResult,
  BreakdownTotals,
  fetchBreakdown,
  formatTokens,
} from '../api';
import { DailyBars } from './DailyBars';
import { CopyButton } from './CopyButton';

type Props = {
  account: string;
  start: string;
  end: string;
  days: string[];
  refreshToken: string;
};

function emptyTotals(): BreakdownTotals {
  return { totalTokens: 0, inputTokens: 0, outputTokens: 0, cacheTokensHit: 0, reqCnt: 0 };
}

function addTotals(target: BreakdownTotals, source: BreakdownTotals): void {
  target.totalTokens += source.totalTokens;
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheTokensHit += source.cacheTokensHit;
  target.reqCnt += source.reqCnt;
}

function statusLabel(status: string): { text: string; cls: string } {
  if (status === 'Running') return { text: '运行中', cls: 'pill-positive' };
  if (status === 'Stopped') return { text: '已停止', cls: 'pill-neutral' };
  if (status === 'Scheduling') return { text: '调度中', cls: 'pill-warning' };
  if (status === 'Abnormal') return { text: '异常', cls: 'pill-negative' };
  return { text: '清单中不存在', cls: 'pill-neutral' };
}

export function BreakdownTable({ account, start, end, days, refreshToken }: Props) {
  const [data, setData] = useState<BreakdownResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'endpoint' | 'model'>('endpoint');
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchBreakdown({ account, start, end })
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          setData(res.data);
          setError(null);
        } else {
          setData(null);
          setError(typeof res.error === 'string' ? res.error : '明细查询失败');
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account, start, end, refreshToken]);

  const models = useMemo(() => {
    if (!data) return [];
    const map = new Map<
      string,
      { model: string; totals: BreakdownTotals; endpoints: BreakdownEndpoint[] }
    >();
    for (const ep of data.endpoints) {
      const key = ep.model || '未知模型';
      const current = map.get(key) ?? { model: key, totals: emptyTotals(), endpoints: [] };
      addTotals(current.totals, ep.totals);
      current.endpoints.push(ep);
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.totals.totalTokens - a.totals.totalTokens);
  }, [data]);

  const totalTokens = data?.totals.totalTokens ?? 0;

  const share = (value: number) => {
    if (totalTokens <= 0) return 0;
    return Math.min(100, (value / totalTokens) * 100);
  };

  const renderShare = (value: number) =>
    value > 0 ? (
      <span className="share-track">
        <span className="share-fill" style={{ width: `${share(value)}%` }} />
      </span>
    ) : (
      <span className="cell-zero">无用量</span>
    );

  return (
    <div className="breakdown">
      <div className="breakdown-head">
        <h3 className="breakdown-title">用量明细</h3>
        <div className="panel-tools">
          <div className="seg" role="group" aria-label="明细维度">
            <button
              type="button"
              className={mode === 'endpoint' ? 'active' : ''}
              aria-pressed={mode === 'endpoint'}
              onClick={() => {
                setMode('endpoint');
                setOpenKey(null);
              }}
            >
              按接入点
            </button>
            <button
              type="button"
              className={mode === 'model' ? 'active' : ''}
              aria-pressed={mode === 'model'}
              onClick={() => {
                setMode('model');
                setOpenKey(null);
              }}
            >
              按模型
            </button>
          </div>
        </div>
      </div>

      {loading && <p className="empty-hint">正在查询明细…</p>}
      {error && <p className="error-line">{error}</p>}
      {!loading && !error && data && data.derived === 'per-endpoint' && (
        <p className="empty-hint">Ark 未返回接入点维度列，本次已按接入点逐个查询。</p>
      )}

      {!loading && !error && data && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{mode === 'endpoint' ? '名称 / 接入点 ID' : '模型'}</th>
                <th className="hide-sm">{mode === 'endpoint' ? '模型' : '接入点数'}</th>
                <th className="num">Token</th>
                <th className="num hide-sm">输入</th>
                <th className="num hide-sm">输出</th>
                <th className="num">请求</th>
                <th>占比</th>
                <th aria-label="展开" />
              </tr>
            </thead>
            <tbody>
              {mode === 'endpoint' &&
                data.endpoints.map((ep) => {
                  const isOpen = openKey === ep.endpointId;
                  const status = statusLabel(ep.status);
                  return (
                    <Fragment key={ep.endpointId}>
                      <tr
                        className="clickable"
                        onClick={() => setOpenKey(isOpen ? null : ep.endpointId)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setOpenKey(isOpen ? null : ep.endpointId);
                          }
                        }}
                      >
                        <td>
                          <strong>{ep.name}</strong>
                          <div className="row-sub">
                            {ep.endpointId}
                            <CopyButton value={ep.endpointId} label="接入点 ID" /> ·{' '}
                            <span className={`pill ${status.cls}`}>{status.text}</span>
                          </div>
                        </td>
                        <td className="hide-sm">
                          {ep.model}
                          {ep.model !== '未知模型' && (
                            <CopyButton value={ep.model} label="模型名" />
                          )}
                          <div className="row-sub">{ep.modelVersion}</div>
                        </td>
                        <td className={`num ${ep.totals.totalTokens === 0 ? 'cell-zero' : ''}`}>
                          {formatTokens(ep.totals.totalTokens)}
                        </td>
                        <td className="num hide-sm">{formatTokens(ep.totals.inputTokens)}</td>
                        <td className="num hide-sm">{formatTokens(ep.totals.outputTokens)}</td>
                        <td className="num">{formatTokens(ep.totals.reqCnt)}</td>
                        <td>{renderShare(ep.totals.totalTokens)}</td>
                        <td className="chevron" aria-hidden="true">
                          {isOpen ? '−' : '+'}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={8} style={{ padding: 0 }}>
                            <div className="row-expand">
                              {ep.daily.length === 0 ? (
                                <p className="empty-hint">该接入点在所选区间没有调用记录。</p>
                              ) : (
                                <>
                                  <div className="chart-meta">
                                    <span>缓存命中 {formatTokens(ep.totals.cacheTokensHit)}</span>
                                    <span>请求 {formatTokens(ep.totals.reqCnt)}</span>
                                  </div>
                                  <DailyBars rows={ep.daily} days={days} />
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}

              {mode === 'model' &&
                models.map((m) => {
                  const isOpen = openKey === m.model;
                  return (
                    <Fragment key={m.model}>
                      <tr
                        className="clickable"
                        onClick={() => setOpenKey(isOpen ? null : m.model)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setOpenKey(isOpen ? null : m.model);
                          }
                        }}
                      >
                        <td>
                          <strong>{m.model}</strong>
                          {m.model !== '未知模型' && <CopyButton value={m.model} label="模型名" />}
                        </td>
                        <td className="hide-sm cell-zero">{m.endpoints.length} 个</td>
                        <td className={`num ${m.totals.totalTokens === 0 ? 'cell-zero' : ''}`}>
                          {formatTokens(m.totals.totalTokens)}
                        </td>
                        <td className="num hide-sm">{formatTokens(m.totals.inputTokens)}</td>
                        <td className="num hide-sm">{formatTokens(m.totals.outputTokens)}</td>
                        <td className="num">{formatTokens(m.totals.reqCnt)}</td>
                        <td>{renderShare(m.totals.totalTokens)}</td>
                        <td className="chevron" aria-hidden="true">
                          {isOpen ? '−' : '+'}
                        </td>
                      </tr>
                      {isOpen &&
                        m.endpoints.map((ep) => (
                          <tr key={`${m.model}-${ep.endpointId}`} className="child-row">
                            <td>
                              <span className="row-sub">
                                {ep.name} · {ep.endpointId}
                              </span>
                            </td>
                            <td className="hide-sm" />
                            <td className="num">{formatTokens(ep.totals.totalTokens)}</td>
                            <td className="num hide-sm">{formatTokens(ep.totals.inputTokens)}</td>
                            <td className="num hide-sm">{formatTokens(ep.totals.outputTokens)}</td>
                            <td className="num">{formatTokens(ep.totals.reqCnt)}</td>
                            <td>{renderShare(ep.totals.totalTokens)}</td>
                            <td />
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}

              {mode === 'endpoint' && data.unattributed.totalTokens > 0 && (
                <tr>
                  <td>
                    <strong>未归属接入点</strong>
                    <div className="row-sub">Ark 用量记录中未关联接入点的部分</div>
                  </td>
                  <td className="hide-sm">—</td>
                  <td className="num">{formatTokens(data.unattributed.totalTokens)}</td>
                  <td className="num hide-sm">{formatTokens(data.unattributed.inputTokens)}</td>
                  <td className="num hide-sm">{formatTokens(data.unattributed.outputTokens)}</td>
                  <td className="num">{formatTokens(data.unattributed.reqCnt)}</td>
                  <td>{renderShare(data.unattributed.totalTokens)}</td>
                  <td />
                </tr>
              )}

              {!loading && data.endpoints.length === 0 && (
                <tr>
                  <td colSpan={8} className="cell-zero">
                    该账户在此项目下没有接入点。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
