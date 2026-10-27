import { Fragment, useEffect, useState } from 'react';
import { AccountView, listAccounts, verifyAccount } from '../api';
import { AccountForm } from '../components/AccountForm';
import { ConfirmDelete } from '../components/ConfirmDelete';

type VerifyState = { status: 'checking' | 'ok' | 'fail'; message: string };

export function AccountsView() {
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<AccountView | null>(null);
  const [deleting, setDeleting] = useState<AccountView | null>(null);
  const [verify, setVerify] = useState<Record<string, VerifyState>>({});

  const load = () => {
    setLoading(true);
    listAccounts()
      .then((res) => {
        if (res.success && res.data) setAccounts(res.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const runVerify = async (name: string) => {
    setVerify((prev) => ({ ...prev, [name]: { status: 'checking', message: '验证中…' } }));
    const res = await verifyAccount(name);
    if (res.success && res.data) {
      setVerify((prev) => ({
        ...prev,
        [name]: res.data!.ok
          ? {
              status: 'ok',
              message: `权限正常 · 项目 ${res.data!.project} · ${res.data!.total} 个接入点`,
            }
          : { status: 'fail', message: res.data!.error ?? '验证失败' },
      }));
    } else {
      setVerify((prev) => ({
        ...prev,
        [name]: { status: 'fail', message: typeof res.error === 'string' ? res.error : '验证失败' },
      }));
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>账户</h1>
          <p className="sub">AK/SK 仅保存在本机配置文件，界面只显示掩码</p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => setFormMode('create')}>
            新增账户
          </button>
        </div>
      </header>

      <section className="panel" aria-label="账户列表" style={{ marginTop: 0 }}>
        {loading && accounts.length === 0 && <p className="state">正在加载…</p>}
        {!loading && accounts.length === 0 && (
          <p className="state">还没有账户。点击「新增账户」填入 AK/SK 与项目名。</p>
        )}

        {accounts.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th className="hide-sm">项目</th>
                  <th>AK</th>
                  <th>状态</th>
                  <th className="hide-sm">备注</th>
                  <th aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const v = verify[a.name];
                  return (
                    <Fragment key={a.name}>
                      <tr key={a.name}>
                        <td>
                          <strong>{a.label || a.name}</strong>
                          <div className="sub">{a.name}</div>
                        </td>
                        <td className="hide-sm">{a.project}</td>
                        <td className="id-cell">{a.ak_masked}</td>
                        <td>
                          <span className={`pill ${a.enabled ? 'pill-positive' : 'pill-neutral'}`}>
                            {a.enabled ? '启用' : '停用'}
                          </span>
                        </td>
                        <td className="hide-sm">{a.note || '—'}</td>
                        <td>
                          <div
                            style={{
                              display: 'flex',
                              gap: 6,
                              justifyContent: 'flex-end',
                              flexWrap: 'wrap',
                            }}
                          >
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              onClick={() => runVerify(a.name)}
                            >
                              验证
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              onClick={() => {
                                setEditing(a);
                                setFormMode('edit');
                              }}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              onClick={() => setDeleting(a)}
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                      {v && (
                        <tr key={`${a.name}-verify`}>
                          <td colSpan={6} style={{ paddingTop: 0 }}>
                            <span
                              className="sub"
                              style={{
                                color:
                                  v.status === 'fail'
                                    ? 'var(--negative)'
                                    : v.status === 'ok'
                                      ? 'var(--positive)'
                                      : 'var(--muted)',
                              }}
                            >
                              {v.message}
                            </span>
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

      {formMode === 'create' && (
        <AccountForm mode="create" onClose={() => setFormMode(null)} onSaved={load} />
      )}
      {formMode === 'edit' && editing && (
        <AccountForm
          mode="edit"
          initial={editing}
          onClose={() => {
            setFormMode(null);
            setEditing(null);
          }}
          onSaved={load}
        />
      )}
      {deleting && (
        <ConfirmDelete name={deleting.name} onClose={() => setDeleting(null)} onDeleted={load} />
      )}
    </>
  );
}
