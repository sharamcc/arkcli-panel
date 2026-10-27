import { useState } from 'react';
import { deleteAccount } from '../api';

type Props = {
  name: string;
  onClose: () => void;
  onDeleted: () => void;
};

export function ConfirmDelete({ name, onClose, onDeleted }: Props) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (typed !== name) {
      setError('输入的名称不一致');
      return;
    }
    setBusy(true);
    const res = await deleteAccount(name);
    setBusy(false);
    if (res.success) {
      onDeleted();
      onClose();
    } else {
      setError(typeof res.error === 'string' ? res.error : '删除失败');
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="删除账户确认">
      <div className="modal">
        <h2>删除账户 {name}</h2>
        <p className="sub" style={{ marginBottom: 16 }}>
          该操作会删除本地配置文件。AK/SK 无法从界面找回，需要重新到控制台生成。请输入账户名称确认。
        </p>
        <div className="field">
          <label htmlFor="confirm-name">账户名称</label>
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
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? '删除中…' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  );
}
