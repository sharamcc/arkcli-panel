import { useState } from 'react';
import { UsageView } from './views/UsageView';
import { EndpointsView } from './views/EndpointsView';
import { AccountsView } from './views/AccountsView';
import { useI18n } from './i18n';

type Tab = 'usage' | 'endpoints' | 'accounts';

export default function App() {
  const [tab, setTab] = useState<Tab>('usage');
  const { t, lang, setLang } = useI18n();

  const tabs: { id: Tab; label: string }[] = [
    { id: 'usage', label: t('nav.usage') },
    { id: 'endpoints', label: t('nav.endpoints') },
    { id: 'accounts', label: t('nav.accounts') },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>{t('app.title')}</span>
        </div>
        <nav aria-label={t('app.title')}>
          <ul className="nav">
            {tabs.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={tab === item.id ? 'active' : ''}
                  aria-current={tab === item.id ? 'page' : undefined}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-foot">
          <div>{t('footer.region')}</div>
          <div>{t('footer.refresh')}</div>
          <div className="lang-switch" role="group" aria-label="Language">
            <button
              type="button"
              className={lang === 'zh' ? 'active' : ''}
              aria-pressed={lang === 'zh'}
              onClick={() => setLang('zh')}
            >
              中文
            </button>
            <button
              type="button"
              className={lang === 'en' ? 'active' : ''}
              aria-pressed={lang === 'en'}
              onClick={() => setLang('en')}
            >
              EN
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        {tab === 'usage' && <UsageView />}
        {tab === 'endpoints' && <EndpointsView />}
        {tab === 'accounts' && <AccountsView />}
      </main>
    </div>
  );
}
