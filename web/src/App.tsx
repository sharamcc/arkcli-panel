import { useState } from 'react';
import { UsageView } from './views/UsageView';
import { EndpointsView } from './views/EndpointsView';
import { AccountsView } from './views/AccountsView';

type Tab = 'usage' | 'endpoints' | 'accounts';

const TABS: { id: Tab; label: string }[] = [
  { id: 'usage', label: '用量' },
  { id: 'endpoints', label: '接入点' },
  { id: 'accounts', label: '账户' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('usage');

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>Ark 账户面板</span>
        </div>
        <nav aria-label="主导航">
          <ul className="nav">
            {TABS.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={tab === t.id ? 'active' : ''}
                  aria-current={tab === t.id ? 'page' : undefined}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-foot">
          BytePlus Ark · ap-southeast-1
          <br />
          数据每 5 分钟自动刷新
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
