import { Fragment, useEffect, useState } from 'react';
import { AccountView, listAccounts, verifyAccount } from '../api';
import { AccountForm } from '../components/AccountForm';
import { ConfirmDelete } from '../components/ConfirmDelete';
import { useI18n } from '../i18n';

type VerifyState = { status: 'checking' | 'ok' | 'fail'; message: string };

export function AccountsView() {
  const { t, te } = useI18n();
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
    setVerify((prev) => ({
      ...prev,
      [name]: { status: 'checking', message: t('accounts.verify.checking') },
    }));
    const res = await verifyAccount(name);
    if (res.success && res.data) {
      setVerify((prev) => ({
        ...prev,
        [name]: res.data!.ok
          ? {
              status: 'ok',
              message: t('accounts.verify.ok', {
                project: res.data!.project,
                total: res.data!.total ?? 0,
              }),
            }
          : { status: 'fail', message: t('accounts.verify.fail') },
      }));
    } else {
      setVerify((prev) => ({
        ...prev,
        [name]: { status: 'fail', message: te(res.code, res.error) },
      }));
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{t('accounts.title')}</h1>
          <p className="sub">{t('accounts.subtitle')}</p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => setFormMode('create')}>
            {t('accounts.add')}
          </button>
        </div>
      </header>

      <section className="panel" aria-label={t('accounts.title')} style={{ marginTop: 0 }}>
        {loading && accounts.length === 0 && <p className="state">{t('common.loading')}</p>}
        {!loading && accounts.length === 0 && <p className="state">{t('accounts.empty')}</p>}

        {accounts.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('accounts.col.name')}</th>
                  <th className="hide-sm">{t('accounts.col.project')}</th>
                  <th>{t('accounts.col.ak')}</th>
                  <th>{t('accounts.col.status')}</th>
                  <th className="hide-sm">{t('accounts.col.note')}</th>
                  <th aria-label="actions" />
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const v = verify[a.name];
                  return (
                    <Fragment key={a.name}>
                      <tr>
                        <td>
                          <strong>{a.label || a.name}</strong>
                          <div className="sub">{a.name}</div>
                        </td>
                        <td className="hide-sm">{a.project}</td>
                        <td className="id-cell">{a.ak_masked}</td>
                        <td>
                          <span className={`pill ${a.enabled ? 'pill-positive' : 'pill-neutral'}`}>
                            {a.enabled ? t('accounts.enabled') : t('accounts.disabled')}
                          </span>
                        </td>
                        <td className="hide-sm">{a.note || t('common.none')}</td>
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
                              {t('accounts.verify')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              onClick={() => {
                                setEditing(a);
                                setFormMode('edit');
                              }}
                            >
                              {t('accounts.edit')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              onClick={() => setDeleting(a)}
                            >
                              {t('common.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {v && (
                        <tr>
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
