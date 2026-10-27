import { useState } from 'react';
import { deleteAccount } from '../api';
import { useI18n } from '../i18n';

type Props = {
  name: string;
  onClose: () => void;
  onDeleted: () => void;
};

export function ConfirmDelete({ name, onClose, onDeleted }: Props) {
  const { t, te } = useI18n();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (typed !== name) {
      setError(t('delete.mismatch'));
      return;
    }
    setBusy(true);
    const res = await deleteAccount(name);
    setBusy(false);
    if (res.success) {
      onDeleted();
      onClose();
    } else {
      setError(te(res.code, res.error));
    }
  };

  const title = t('delete.title', { name });

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <h2>{title}</h2>
        <p className="sub" style={{ marginBottom: 16 }}>
          {t('delete.warning')}
        </p>
        <div className="field">
          <label htmlFor="confirm-name">{t('delete.label')}</label>
          <input
            id="confirm-name"
            className="input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        </div>
        {error && <p className="field-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? t('common.deleting') : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
