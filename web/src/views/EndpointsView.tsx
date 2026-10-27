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

const STATUS_OPTIONS = ['', 'Running', 'Scheduling', 'Abnormal', 'Stopped'];

function StatusPill({ status }: { status: EndpointItem['Status'] }) {
  const cls =
    status === 'Running'
      ? 'pill-positive'
      : status === 'Abnormal'
        ? 'pill-negative'
        : status === 'Scheduling'
          ? 'pill-warning'
          : 'pill-neutral';
  const label =
    status === 'Running'
      ? '运行中'
      : status === 'Stopped'
        ? '已停止'
        : status === 'Scheduling'
          ? '调度中'
          : '异常';
  return <span className={`pill ${cls}`}>{label}</span>;
}

export function EndpointsView() {
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
        setDetailError(typeof res.error === 'string' ? res.error : '详情获取失败');
      }
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>接入点</h1>
          <p className="sub">只读视图 · 共 {rows.length} 个接入点</p>
        </div>
      </header>

      <section className="panel" aria-label="接入点筛选" style={{ marginTop: 0 }}>
        <div className="panel-head">
          <div className="panel-tools">
            <select
              className="select"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              aria-label="按账户筛选"
            >
              <option value="">全部账户</option>
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
              aria-label="按状态筛选"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === '' ? '全部状态' : s}
                </option>
              ))}
            </select>
            <input
              className="input input-sm"
              placeholder="按名称搜索"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="按名称搜索"
            />
            <button type="button" className="btn btn-primary" onClick={load}>
              查询
            </button>
          </div>
        </div>

        {failed.length > 0 && (
          <p className="notice">{failed.map((f) => `${f.account}: ${f.error}`).join('；')}</p>
        )}

        {loading && <p className="state">正在查询…</p>}
        {!loading && rows.length === 0 && failed.length === 0 && (
          <p className="state">没有符合条件的接入点</p>
        )}

        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>接入点 ID</th>
                  <th>状态</th>
                  <th>模型</th>
                  <th className="hide-sm">项目</th>
                  <th className="num hide-sm">RPM / TPM</th>
                  <th className="hide-sm">创建时间</th>
                  <th aria-label="展开" />
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
                        key={key}
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
                          <CopyButton value={ep.Id} label="接入点 ID" />
                        </td>
                        <td>
                          <StatusPill status={ep.Status} />
                        </td>
                        <td>
                          {modelName || '—'}
                          {modelName && <CopyButton value={modelName} label="模型名" />}
                          <div className="sub">{modelVersion}</div>
                        </td>
                        <td className="hide-sm">{ep.ProjectName}</td>
                        <td className="num hide-sm">
                          {ep.RateLimit ? `${ep.RateLimit.Rpm} / ${ep.RateLimit.Tpm}` : '—'}
                        </td>
                        <td className="hide-sm">
                          {new Date(ep.CreateTime).toLocaleString('zh-CN', { hour12: false })}
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
                                  <dt>描述</dt>
                                  <dd>{(details[key]?.Description as string) || '—'}</dd>
                                </div>
                                <div className="detail-item">
                                  <dt>模型类型</dt>
                                  <dd>
                                    {String(
                                      details[key]?.EndpointModelType ?? ep.EndpointModelType,
                                    )}
                                  </dd>
                                </div>
                                <div className="detail-item">
                                  <dt>更新时间</dt>
                                  <dd>
                                    {new Date(
                                      String(details[key]?.UpdateTime ?? ep.UpdateTime),
                                    ).toLocaleString('zh-CN', { hour12: false })}
                                  </dd>
                                </div>
                                <div className="detail-item">
                                  <dt>支持版本切换</dt>
                                  <dd>
                                    {details[key]?.SupportRolling === undefined
                                      ? '—'
                                      : details[key]?.SupportRolling
                                        ? '是'
                                        : '否'}
                                  </dd>
                                </div>
                                <div className="detail-item">
                                  <dt>标签</dt>
                                  <dd>
                                    {(ep.Tags ?? []).map((t) => `${t.Key}=${t.Value}`).join(', ') ||
                                      '—'}
                                  </dd>
                                </div>
                                <div className="detail-item">
                                  <dt>状态说明</dt>
                                  <dd>{ep.StatusReason || '—'}</dd>
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
