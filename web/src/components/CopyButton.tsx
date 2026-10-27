import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';

// 局域网是 HTTP，navigator.clipboard 只在安全上下文可用，需要回退到 execCommand
function legacyCopy(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  document.body.appendChild(textarea);
  textarea.select();

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    // 不支持时保持 false
  }
  document.body.removeChild(textarea);
  return ok;
}

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    // 失去焦点时 writeText 可能长时间不返回，用超时兜底，避免界面无反馈
    const result = await Promise.race([
      navigator.clipboard.writeText(text).then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => {
        window.setTimeout(() => resolve(false), 600);
      }),
    ]);
    if (result) return true;
  }
  return legacyCopy(text);
}

type Props = {
  value: string;
  label: string;
};

export function CopyButton({ value, label }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    };
  }, []);

  const handleClick = async (event: React.MouseEvent) => {
    // 阻止触发所在行的展开/跳转
    event.stopPropagation();
    const ok = await copyText(value);
    setState(ok ? 'copied' : 'failed');
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2000);
  };

  return (
    <button
      type="button"
      className={`copy-btn ${state === 'copied' ? 'is-copied' : ''}`}
      aria-label={`${t('common.copy')} ${label}`}
      title={`${t('common.copy')} ${label}`}
      onClick={handleClick}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {state === 'copied'
        ? t('common.copied')
        : state === 'failed'
          ? t('common.copyFailed')
          : t('common.copy')}
    </button>
  );
}
