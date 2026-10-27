import { useState } from 'react';
import { AccountInput, AccountView, createAccount, updateAccount } from '../api';

type Props = {
  mode: 'create' | 'edit';
  initial?: AccountView;
  onClose: () => void;
  onSaved: () => void;
};

export function AccountForm({ mode, initial, onClose, onSaved }: Props) {
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
      setError('名称只允许字母、数字与短横线');
      return;
    }
    if (mode === 'create' && (!ak.trim() || !sk.trim())) {
      setError('AK 与 SK 都必须填写');
      return;
    }
    if (mode === 'edit' && sk && !ak) {
      setError('更换 SK 时也需要填写 AK');
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
      setError(typeof res.error === 'string' ? res.error : '保存失败，请检查字段');
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'create' ? '新增账户' : '编辑账户'}
    >
      <div className="modal">
        <h2>{mode === 'create' ? '新增账户' : `编辑 ${initial?.name}`}</h2>

        {mode === 'create' && (
          <div className="field">
            <label htmlFor="acct-name">账户名称</label>
            <input
              id="acct-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="gb001"
              autoComplete="off"
            />
            <span className="hint">同时作为配置文件名，创建后不可修改</span>
          </div>
        )}

        <div className="field">
          <label htmlFor="acct-label">显示名称（可选）</label>
          <input
            id="acct-label"
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="掌中云主账户"
          />
        </div>

        <div className="field">
          <label htmlFor="acct-ak">Access Key ID{mode === 'edit' ? '（留空保持原值）' : ''}</label>
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
            Secret Access Key{mode === 'edit' ? '（留空保持原值）' : ''}
          </label>
          <input
            id="acct-sk"
            className="input"
            type="password"
            value={sk}
            onChange={(e) => setSk(e.target.value)}
            placeholder={mode === 'edit' ? '不修改则留空' : ''}
            autoComplete="new-password"
          />
          <span className="hint">写入本机 configs/accounts 目录，不会显示在界面上</span>
        </div>

        <div className="field">
          <label htmlFor="acct-project">项目名（可选）</label>
          <input
            id="acct-project"
            className="input"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="留空则等于账户名称"
          />
          <span className="hint">Ark 授权按项目划分，须与 IAM 授权的项目一致</span>
        </div>

        <div className="field">
          <label htmlFor="acct-note">备注（可选）</label>
          <input
            id="acct-note"
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="field switch-row">
          <label htmlFor="acct-enabled">启用</label>
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
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
