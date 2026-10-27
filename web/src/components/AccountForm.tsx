import { useState } from 'react';
import { AccountInput, AccountView, createAccount, updateAccount } from '../api';
import { useI18n } from '../i18n';

type Props = {
  mode: 'create' | 'edit';
  initial?: AccountView;
  onClose: () => void;
  onSaved: () => void;
};

export function AccountForm({ mode, initial, onClose, onSaved }: Props) {
  const { t, te } = useI18n();
  const [name, setName] = useState(initial?.name ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [ak, setAk] = useState('');
  const [sk, setSk] = useState('');
  const [project, setProject] = useState(initial?.project ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    if (mode === 'create' && !/^[a-zA-Z0-9-]+$/.test(name)) {
      setError(t('form.err.name'));
      return;
    }
    if (mode === 'create' && (!ak.trim() || !sk.trim())) {
      setError(t('form.err.akSk'));
      return;
    }
    if (mode === 'edit' && sk && !ak) {
      setError(t('form.err.akForSk'));
      return;
    }

    const input: AccountInput = {
      label: label || undefined,
      ak: ak || undefined,
      sk: sk || undefined,
      project: project || undefined,
      note: note || undefined,
      enabled,
    };

    setSaving(true);
    const res =
      mode === 'create'
        ? await createAccount({ ...input, name })
        : await updateAccount(initial!.name, input);
    setSaving(false);

    if (res.success) {
      onSaved();
      onClose();
    } else {
      setError(te(res.code, res.error) || t('form.err.save'));
    }
  };

  const title =
    mode === 'create' ? t('form.createTitle') : t('form.editTitle', { name: initial?.name ?? '' });

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <h2>{title}</h2>

        {mode === 'create' && (
          <div className="field">
            <label htmlFor="acct-name">{t('form.name')}</label>
            <input
              id="acct-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="gb001"
              autoComplete="off"
            />
            <span className="hint">{t('form.nameHint')}</span>
          </div>
        )}

        <div className="field">
          <label htmlFor="acct-label">{t('form.label')}</label>
          <input
            id="acct-label"
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('form.labelPlaceholder')}
          />
        </div>

        <div className="field">
          <label htmlFor="acct-ak">
            {t('form.ak')}
            {mode === 'edit' ? ` ${t('form.akKeep')}` : ''}
          </label>
          <input
            id="acct-ak"
            className="input"
            value={ak}
            onChange={(e) => setAk(e.target.value)}
            placeholder={mode === 'edit' ? initial?.ak_masked : 'AKAP…'}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="field">
          <label htmlFor="acct-sk">
            {t('form.sk')}
            {mode === 'edit' ? ` ${t('form.skKeep')}` : ''}
          </label>
          <input
            id="acct-sk"
            className="input"
            type="password"
            value={sk}
            onChange={(e) => setSk(e.target.value)}
            placeholder={mode === 'edit' ? t('form.skPlaceholderKeep') : ''}
            autoComplete="new-password"
          />
          <span className="hint">{t('form.skHint')}</span>
        </div>

        <div className="field">
          <label htmlFor="acct-project">{t('form.project')}</label>
          <input
            id="acct-project"
            className="input"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder={t('form.projectPlaceholder')}
          />
          <span className="hint">{t('form.projectHint')}</span>
        </div>

        <div className="field">
          <label htmlFor="acct-note">{t('form.note')}</label>
          <input
            id="acct-note"
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="field switch-row">
          <label htmlFor="acct-enabled">{t('form.enabled')}</label>
          <input
            id="acct-enabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
        </div>

        {error && <p className="field-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
