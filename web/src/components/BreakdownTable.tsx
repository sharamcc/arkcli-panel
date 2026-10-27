import { Fragment, useEffect, useMemo, useState } from 'react';
import { BreakdownEndpoint, BreakdownResult, BreakdownTotals, fetchBreakdown } from '../api';
import { DailyBars } from './DailyBars';
import { CopyButton } from './CopyButton';
import { formatTokens, useI18n } from '../i18n';

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

export function BreakdownTable({ account, start, end, days, refreshToken }: Props) {
  const { t, te, lang } = useI18n();
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
          setError(te(res.code, res.error) || t('breakdown.failed'));
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
  }, [account, start, end, refreshToken, te, t]);

  const models = useMemo(() => {
    if (!data) return [];
    const map = new Map<
      string,
      { model: string; totals: BreakdownTotals; endpoints: BreakdownEndpoint[] }
    >();
    for (const ep of data.endpoints) {
      const key = ep.model;
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
      <span className="cell-zero">{t('breakdown.noUsage')}</span>
    );

  const statusLabel = (status: string) => {
    if (status === 'Running') return { text: t('status.running'), cls: 'pill-positive' };
    if (status === 'Stopped') return { text: t('status.stopped'), cls: 'pill-neutral' };
    if (status === 'Scheduling') return { text: t('status.scheduling'), cls: 'pill-warning' };
    if (status === 'Abnormal') return { text: t('status.abnormal'), cls: 'pill-negative' };
    return { text: t('status.unknown'), cls: 'pill-neutral' };
  };

  const tokenClass = (value: number) => `num ${value === 0 ? 'cell-zero' : ''}`;

  return (
    <div className="breakdown">
      <div className="breakdown-head">
        <h3 className="breakdown-title">{t('breakdown.title')}</h3>
        <div className="panel-tools">
          <div className="seg" role="group" aria-label={t('breakdown.title')}>
            <button
              type="button"
              className={mode === 'endpoint' ? 'active' : ''}
              aria-pressed={mode === 'endpoint'}
              onClick={() => {
                setMode('endpoint');
                setOpenKey(null);
              }}
            >
              {t('breakdown.byEndpoint')}
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
              {t('breakdown.byModel')}
            </button>
          </div>
        </div>
      </div>

      {loading && <p className="empty-hint">{t('breakdown.loading')}</p>}
      {error && <p className="error-line">{error}</p>}
      {!loading && !error && data && data.derived === 'per-endpoint' && (
        <p className="empty-hint">{t('breakdown.fallback')}</p>
      )}

      {!loading && !error && data && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{mode === 'endpoint' ? t('breakdown.col.name') : t('common.model')}</th>
                <th className="hide-sm">
                  {mode === 'endpoint' ? t('common.model') : t('breakdown.col.endpoints')}
                </th>
                <th className="num">{t('common.tokens')}</th>
                <th className="num hide-sm">{t('common.input')}</th>
                <th className="num hide-sm">{t('common.output')}</th>
                <th className="num">{t('common.requests')}</th>
                <th>{t('common.share')}</th>
                <th aria-label="expand" />
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
                            <CopyButton
                              value={ep.endpointId}
                              label={t('breakdown.col.name')}
                            /> · <span className={`pill ${status.cls}`}>{status.text}</span>
                          </div>
                        </td>
                        <td className="hide-sm">
                          {ep.model || t('common.none')}
                          {ep.model && <CopyButton value={ep.model} label={t('common.model')} />}
                          <div className="row-sub">{ep.modelVersion}</div>
                        </td>
                        <td className={tokenClass(ep.totals.totalTokens)}>
                          {formatTokens(ep.totals.totalTokens, lang)}
                        </td>
                        <td className="num hide-sm">{formatTokens(ep.totals.inputTokens, lang)}</td>
                        <td className="num hide-sm">
                          {formatTokens(ep.totals.outputTokens, lang)}
                        </td>
                        <td className="num">{formatTokens(ep.totals.reqCnt, lang)}</td>
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
                                <p className="empty-hint">{t('breakdown.endpointNoUsage')}</p>
                              ) : (
                                <>
                                  <div className="chart-meta">
                                    <span>
                                      {t('common.cache')}{' '}
                                      {formatTokens(ep.totals.cacheTokensHit, lang)}
                                    </span>
                                    <span>
                                      {t('common.requests')} {formatTokens(ep.totals.reqCnt, lang)}
                                    </span>
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
                          <strong>{m.model || t('common.none')}</strong>
                          {m.model && <CopyButton value={m.model} label={t('common.model')} />}
                        </td>
                        <td className="hide-sm cell-zero">
                          {t('breakdown.col.count', { n: m.endpoints.length })}
                        </td>
                        <td className={tokenClass(m.totals.totalTokens)}>
                          {formatTokens(m.totals.totalTokens, lang)}
                        </td>
                        <td className="num hide-sm">{formatTokens(m.totals.inputTokens, lang)}</td>
                        <td className="num hide-sm">{formatTokens(m.totals.outputTokens, lang)}</td>
                        <td className="num">{formatTokens(m.totals.reqCnt, lang)}</td>
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
                            <td className="num">{formatTokens(ep.totals.totalTokens, lang)}</td>
                            <td className="num hide-sm">
                              {formatTokens(ep.totals.inputTokens, lang)}
                            </td>
                            <td className="num hide-sm">
                              {formatTokens(ep.totals.outputTokens, lang)}
                            </td>
                            <td className="num">{formatTokens(ep.totals.reqCnt, lang)}</td>
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
                    <strong>{t('breakdown.unattributed')}</strong>
                    <div className="row-sub">{t('breakdown.unattributedHint')}</div>
                  </td>
                  <td className="hide-sm">—</td>
                  <td className="num">{formatTokens(data.unattributed.totalTokens, lang)}</td>
                  <td className="num hide-sm">
                    {formatTokens(data.unattributed.inputTokens, lang)}
                  </td>
                  <td className="num hide-sm">
                    {formatTokens(data.unattributed.outputTokens, lang)}
                  </td>
                  <td className="num">{formatTokens(data.unattributed.reqCnt, lang)}</td>
                  <td>{renderShare(data.unattributed.totalTokens)}</td>
                  <td />
                </tr>
              )}

              {data.endpoints.length === 0 && (
                <tr>
                  <td colSpan={8} className="cell-zero">
                    {t('breakdown.emptyEndpoints')}
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
