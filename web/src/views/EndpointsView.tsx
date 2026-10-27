import { Fragment, useEffect, useState } from 'react';
import { CopyButton } from '../components/CopyButton';
import {
  AccountView,
  EndpointItem,
  PerAccountEndpoints,
  fetchEndpointDetail,
  fetchEndpoints,
  listAccounts,
} from '../api';
import { useI18n } from '../i18n';

export function EndpointsView() {
  const { t, te } = useI18n();
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [account, setAccount] = useState('');
  const [status, setStatus] = useState('');
  const [name, setName] = useState('');
  const [results, setResults] = useState<PerAccountEndpoints[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Record<string, unknown>>>({});
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    listAccounts().then((res) => {
      if (res.success && res.data) setAccounts(res.data);
    });
  }, []);

  const load = () => {
    setLoading(true);
    fetchEndpoints({
      account: account || undefined,
      status: status || undefined,
      name: name || undefined,
    })
      .then((res) => {
        if (res.success && res.data) setResults(res.data);
        else setResults([]);
      })
      .finally(() => setLoading(false));
  };

  // 首次进入时加载；之后的筛选由「查询」按钮触发，筛选变化不应自动请求
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = results.flatMap((r) =>
    (r.endpoints ?? []).map((ep) => ({ account: r.account, ep })),
  );
  const failed = results.filter((r) => r.error);

  const toggle = async (key: string, acct: string, id: string) => {
    if (expanded === key) {
      setExpanded(null);
      return;
    }
    setExpanded(key);
    setDetailError(null);
    if (!details[key]) {
      const res = await fetchEndpointDetail(acct, id);
      if (res.success && res.data) {
        setDetails((prev) => ({ ...prev, [key]: res.data as Record<string, unknown> }));
      } else {
        setDetailError(te(res.code, res.error));
      }
    }
  };

  const statusPill = (value: EndpointItem['Status']) => {
    if (value === 'Running')
      return <span className="pill pill-positive">{t('status.running')}</span>;
    if (value === 'Stopped')
      return <span className="pill pill-neutral">{t('status.stopped')}</span>;
    if (value === 'Scheduling')
      return <span className="pill pill-warning">{t('status.scheduling')}</span>;
    return <span className="pill pill-negative">{t('status.abnormal')}</span>;
  };

  const statusOptions = [
    { value: '', label: t('endpoints.allStatus') },
    { value: 'Running', label: t('status.running') },
    { value: 'Scheduling', label: t('status.scheduling') },
    { value: 'Abnormal', label: t('status.abnormal') },
    { value: 'Stopped', label: t('status.stopped') },
  ];

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{t('endpoints.title')}</h1>
          <p className="sub">{t('endpoints.subtitle', { n: rows.length })}</p>
        </div>
      </header>

      <section className="panel" aria-label={t('endpoints.title')} style={{ marginTop: 0 }}>
        <div className="panel-head">
          <div className="panel-tools">
            <select
              className="select"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              aria-label={t('endpoints.allAccounts')}
            >
              <option value="">{t('endpoints.allAccounts')}</option>
              {accounts
                .filter((a) => a.enabled)
                .map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.label || a.name}
                  </option>
                ))}
            </select>
            <select
              className="select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label={t('endpoints.col.status')}
            >
              {statusOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <input
              className="input input-sm"
              placeholder={t('endpoints.search')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label={t('endpoints.search')}
            />
            <button type="button" className="btn btn-primary" onClick={load}>
              {t('common.query')}
            </button>
          </div>
        </div>

        {failed.length > 0 && (
          <p className="notice">{failed.map((f) => `${f.account}: ${f.error}`).join('; ')}</p>
        )}

        {loading && <p className="state">{t('common.loading')}</p>}
        {!loading && rows.length === 0 && failed.length === 0 && (
          <p className="state">{t('endpoints.empty')}</p>
        )}

        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('endpoints.col.name')}</th>
                  <th>{t('endpoints.col.id')}</th>
                  <th>{t('endpoints.col.status')}</th>
                  <th>{t('endpoints.col.model')}</th>
                  <th className="hide-sm">{t('endpoints.col.project')}</th>
                  <th className="num hide-sm">{t('endpoints.col.rate')}</th>
                  <th className="hide-sm">{t('endpoints.col.created')}</th>
                  <th aria-label="expand" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ account: acct, ep }) => {
                  const key = `${acct}|${ep.Id}`;
                  const isOpen = expanded === key;
                  const modelName =
                    ep.ModelReference?.FoundationModel?.Name ??
                    ep.ModelReference?.CustomModelId ??
                    '';
                  const modelVersion = ep.ModelReference?.FoundationModel?.ModelVersion ?? '';
                  return (
                    <Fragment key={key}>
                      <tr
                        className="clickable"
                        onClick={() => toggle(key, acct, ep.Id)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggle(key, acct, ep.Id);
                          }
                        }}
                      >
                        <td>
                          <strong>{ep.Name}</strong>
                          <div className="sub">{acct}</div>
                        </td>
                        <td className="id-cell">
                          {ep.Id}
                          <CopyButton value={ep.Id} label={t('endpoints.col.id')} />
                        </td>
                        <td>{statusPill(ep.Status)}</td>
                        <td>
                          {modelName || t('common.none')}
                          {modelName && <CopyButton value={modelName} label={t('common.model')} />}
                          <div className="sub">{modelVersion}</div>
                        </td>
                        <td className="hide-sm">{ep.ProjectName}</td>
                        <td className="num hide-sm">
                          {ep.RateLimit
                            ? `${ep.RateLimit.Rpm} / ${ep.RateLimit.Tpm}`
                            : t('common.none')}
                        </td>
                        <td className="hide-sm">
                          {new Date(ep.CreateTime).toLocaleString(langLocale(), { hour12: false })}
                        </td>
                        <td className="chevron" aria-hidden="true">
                          {isOpen ? '−' : '+'}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${key}-detail`}>
                          <td colSpan={8} style={{ padding: 0 }}>
                            {detailError ? (
                              <p className="error-line" style={{ padding: '12px 24px' }}>
                                {detailError}
                              </p>
                            ) : (
                              <dl className="detail-grid">
                                <div className="detail-item">
                                  <dt>{t('endpoints.detail.description')}</dt>
                                  <dd>
                                    {(details[key]?.Description as string) || t('common.none')}
                                  </dd>
                                </div>
                                <div className="detail-item">
                                  <dt>{t('endpoints.detail.modelType')}</dt>
                                  <dd>
                                    {String(
                                      details[key]?.EndpointModelType ?? ep.EndpointModelType,
                                    )}
                                  </dd>
                                </div>
                                <div className="detail-item">
                                  <dt>{t('endpoints.detail.updated')}</dt>
                                  <dd>
                                    {new Date(
                                      String(details[key]?.UpdateTime ?? ep.UpdateTime),
                                    ).toLocaleString(langLocale(), { hour12: false })}
                                  </dd>
                                </div>
                                <div className="detail-item">
                                  <dt>{t('endpoints.detail.rolling')}</dt>
                                  <dd>
                                    {details[key]?.SupportRolling === undefined
                                      ? t('common.none')
                                      : details[key]?.SupportRolling
                                        ? t('endpoints.yes')
                                        : t('endpoints.no')}
                                  </dd>
                                </div>
                                <div className="detail-item">
                                  <dt>{t('endpoints.detail.tags')}</dt>
                                  <dd>
                                    {(ep.Tags ?? [])
                                      .map((tag) => `${tag.Key}=${tag.Value}`)
                                      .join(', ') || t('common.none')}
                                  </dd>
                                </div>
                                <div className="detail-item">
                                  <dt>{t('endpoints.detail.statusReason')}</dt>
                                  <dd>{ep.StatusReason || t('common.none')}</dd>
                                </div>
                              </dl>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function langLocale(): string {
  return document.documentElement.lang === 'en' ? 'en-US' : 'zh-CN';
}
