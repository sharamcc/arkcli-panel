import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Lang = 'zh' | 'en';

const STORAGE_KEY = 'arkcli-panel.lang';

type Dict = Record<string, string>;

const zh: Dict = {
  'app.title': 'Ark 账户面板',
  'nav.usage': '用量',
  'nav.endpoints': '接入点',
  'nav.accounts': '账户',
  'footer.region': 'BytePlus Ark · ap-southeast-1',
  'footer.refresh': '数据每 5 分钟自动刷新',

  'common.refresh': '刷新',
  'common.query': '查询',
  'common.loading': '正在查询…',
  'common.copy': '复制',
  'common.copied': '已复制',
  'common.copyFailed': '复制失败',
  'common.cancel': '取消',
  'common.save': '保存',
  'common.saving': '保存中…',
  'common.delete': '删除',
  'common.deleting': '删除中…',
  'common.tokens': 'Token',
  'common.input': '输入',
  'common.output': '输出',
  'common.cache': '缓存命中',
  'common.requests': '请求',
  'common.share': '占比',
  'common.project': '项目',
  'common.model': '模型',
  'common.none': '—',

  'status.running': '运行中',
  'status.stopped': '已停止',
  'status.scheduling': '调度中',
  'status.abnormal': '异常',
  'status.unknown': '清单中不存在',

  'error.generic': 'Something went wrong',
  'error.validation': 'Please check the input fields',
  'error.internal': 'Server error',
  'error.account_not_found': 'Account not found',
  'error.account_exists': 'Account already exists',
  'error.usage_too_long': 'Ark limits the range to under 31 days',
  'error.usage_invalid_range': 'End date cannot be earlier than start date',
  'error.write_local_only': 'Write operations are limited to this machine',
  'error.breakdown_fallback_limit': 'Too many endpoints to split without the endpoint column',
  'error.not_found': 'Not found',

  'usage.title': '用量',
  'usage.subtitle': '数据来自 Ark，延迟 5–30 分钟',
  'usage.updatedAt': '更新于 {time} · ',
  'usage.range.today': '今日',
  'usage.range.7d': '近 7 天',
  'usage.range.30d': '近 30 天',
  'usage.range.custom': '自定义',
  'usage.rangeLabel': '区间',
  'usage.custom.start': '开始',
  'usage.custom.end': '结束',
  'usage.custom.hint': '选定开始日期后自动取 31 天窗口，最长不超过 31 天（含首尾）',
  'usage.kpi.today': '今日 token',
  'usage.kpi.range': '{start} 至 {end} 合计',
  'usage.kpi.rangeSame': '{start} 合计',
  'usage.kpi.accounts': '账户',
  'usage.kpi.requests': '区间请求 {n} 次',
  'usage.querying': '正在查询',
  'usage.noData': '暂无数据',
  'usage.chart.title': '全部账户 · 逐日总 token',
  'usage.chart.hint': '按天合计，悬停查看输入与输出',
  'usage.chart.noUsage': '该区间没有用量记录（Ark 只在有调用时产生数据）。',
  'usage.byAccount': '按账户',
  'usage.clickHint': '点击账户查看逐日明细',
  'usage.noAccounts': '还没有配置任何账户',
  'usage.queryFailed': '查询失败',
  'usage.row.noUsage': '该区间没有用量记录（Ark 只在有调用时产生数据）。',
  'usage.failed': '{n} 个账户未取到数据，展开可查看原因。',

  'endpoints.title': '接入点',
  'endpoints.subtitle': '只读视图 · 共 {n} 个接入点',
  'endpoints.allAccounts': '全部账户',
  'endpoints.allStatus': '全部状态',
  'endpoints.search': '按名称搜索',
  'endpoints.empty': '没有符合条件的接入点',
  'endpoints.col.name': '名称',
  'endpoints.col.id': '接入点 ID',
  'endpoints.col.status': '状态',
  'endpoints.col.model': '模型',
  'endpoints.col.project': '项目',
  'endpoints.col.rate': 'RPM / TPM',
  'endpoints.col.created': '创建时间',
  'endpoints.detail.description': '描述',
  'endpoints.detail.modelType': '模型类型',
  'endpoints.detail.updated': '更新时间',
  'endpoints.detail.rolling': '支持版本切换',
  'endpoints.detail.tags': '标签',
  'endpoints.detail.statusReason': '状态说明',
  'endpoints.yes': '是',
  'endpoints.no': '否',

  'accounts.title': '账户',
  'accounts.subtitle': 'AK/SK 仅保存在本机配置文件，界面只显示掩码',
  'accounts.add': '新增账户',
  'accounts.col.name': '名称',
  'accounts.col.project': '项目',
  'accounts.col.ak': 'AK',
  'accounts.col.status': '状态',
  'accounts.col.note': '备注',
  'accounts.enabled': '启用',
  'accounts.disabled': '停用',
  'accounts.verify': '验证',
  'accounts.edit': '编辑',
  'accounts.empty': '还没有账户。点击「新增账户」填入 AK/SK 与项目名。',
  'accounts.verify.checking': '验证中…',
  'accounts.verify.ok': '权限正常 · 项目 {project} · {total} 个接入点',
  'accounts.verify.fail': '验证失败',

  'form.createTitle': '新增账户',
  'form.editTitle': '编辑 {name}',
  'form.name': '账户名称',
  'form.nameHint': '同时作为配置文件名，创建后不可修改',
  'form.label': '显示名称（可选）',
  'form.labelPlaceholder': '掌中云主账户',
  'form.ak': 'Access Key ID',
  'form.akKeep': '（留空保持原值）',
  'form.sk': 'Secret Access Key',
  'form.skKeep': '（留空保持原值）',
  'form.skPlaceholderKeep': '不修改则留空',
  'form.skHint': '写入本机 configs/accounts 目录，不会显示在界面上',
  'form.project': '项目名（可选）',
  'form.projectPlaceholder': '留空则等于账户名称',
  'form.projectHint': 'Ark 授权按项目划分，须与 IAM 授权的项目一致',
  'form.note': '备注（可选）',
  'form.enabled': '启用',
  'form.err.name': '名称只允许字母、数字与短横线',
  'form.err.akSk': 'AK 与 SK 都必须填写',
  'form.err.akForSk': '更换 SK 时也需要填写 AK',
  'form.err.save': '保存失败，请检查字段',

  'delete.title': '删除账户 {name}',
  'delete.warning':
    '该操作会删除本地配置文件。AK/SK 无法从界面找回，需要重新到控制台生成。请输入账户名称确认。',
  'delete.label': '账户名称',
  'delete.mismatch': '输入的名称不一致',
  'delete.failed': '删除失败',

  'breakdown.title': '用量明细',
  'breakdown.byEndpoint': '按接入点',
  'breakdown.byModel': '按模型',
  'breakdown.col.name': '名称 / 接入点 ID',
  'breakdown.col.endpoints': '接入点数',
  'breakdown.col.count': '{n} 个',
  'breakdown.loading': '正在查询明细…',
  'breakdown.noUsage': '无用量',
  'breakdown.unattributed': '未归属接入点',
  'breakdown.unattributedHint': 'Ark 用量记录中未关联接入点的部分',
  'breakdown.fallback': 'Ark 未返回接入点维度列，本次已按接入点逐个查询。',
  'breakdown.emptyEndpoints': '该账户在此项目下没有接入点。',
  'breakdown.endpointNoUsage': '该接入点在所选区间没有调用记录。',
  'breakdown.failed': '明细查询失败',

  'chart.aria': '每日 token 用量柱状图',
  'chart.title': '每日总 token',
  'chart.days': '{n} 天',
  'chart.tooltip': '{day} 总 {total} · 输入 {input} · 输出 {output} · 请求 {requests}',
};

const en: Dict = {
  'app.title': 'Ark Panel',
  'nav.usage': 'Usage',
  'nav.endpoints': 'Endpoints',
  'nav.accounts': 'Accounts',
  'footer.region': 'BytePlus Ark · ap-southeast-1',
  'footer.refresh': 'Auto-refreshes every 5 minutes',

  'common.refresh': 'Refresh',
  'common.query': 'Search',
  'common.loading': 'Loading…',
  'common.copy': 'Copy',
  'common.copied': 'Copied',
  'common.copyFailed': 'Failed',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.saving': 'Saving…',
  'common.delete': 'Delete',
  'common.deleting': 'Deleting…',
  'common.tokens': 'Tokens',
  'common.input': 'Input',
  'common.output': 'Output',
  'common.cache': 'Cache hits',
  'common.requests': 'Requests',
  'common.share': 'Share',
  'common.project': 'Project',
  'common.model': 'Model',
  'common.none': '—',

  'status.running': 'Running',
  'status.stopped': 'Stopped',
  'status.scheduling': 'Scheduling',
  'status.abnormal': 'Abnormal',
  'status.unknown': 'Not in list',

  'error.generic': 'Something went wrong',
  'error.validation': 'Please check the input fields',
  'error.internal': 'Server error',
  'error.account_not_found': 'Account not found',
  'error.account_exists': 'Account already exists',
  'error.usage_too_long': 'Ark limits the range to under 31 days',
  'error.usage_invalid_range': 'End date cannot be earlier than start date',
  'error.write_local_only': 'Write operations are limited to this machine',
  'error.breakdown_fallback_limit': 'Too many endpoints to split without the endpoint column',
  'error.not_found': 'Not found',

  'usage.title': 'Usage',
  'usage.subtitle': 'Data from Ark, delayed by 5–30 minutes',
  'usage.updatedAt': 'Updated {time} · ',
  'usage.range.today': 'Today',
  'usage.range.7d': 'Last 7 days',
  'usage.range.30d': 'Last 30 days',
  'usage.range.custom': 'Custom',
  'usage.rangeLabel': 'Range',
  'usage.custom.start': 'Start',
  'usage.custom.end': 'End',
  'usage.custom.hint':
    'Picking a start date fills a 31-day window; spans longer than 31 days are not allowed',
  'usage.kpi.today': 'Tokens today',
  'usage.kpi.range': 'Total {start} to {end}',
  'usage.kpi.rangeSame': 'Total on {start}',
  'usage.kpi.accounts': 'Accounts',
  'usage.kpi.requests': '{n} requests in range',
  'usage.querying': 'Loading',
  'usage.noData': 'No data yet',
  'usage.chart.title': 'All accounts · daily tokens',
  'usage.chart.hint': 'Summed per day; hover for input and output',
  'usage.chart.noUsage': 'No usage in this range (Ark only records actual calls).',
  'usage.byAccount': 'By account',
  'usage.clickHint': 'Select an account for daily detail',
  'usage.noAccounts': 'No accounts configured yet',
  'usage.queryFailed': 'Query failed',
  'usage.row.noUsage': 'No usage in this range (Ark only records actual calls).',
  'usage.failed': '{n} account(s) returned no data; expand for details.',

  'endpoints.title': 'Endpoints',
  'endpoints.subtitle': 'Read-only · {n} endpoints',
  'endpoints.allAccounts': 'All accounts',
  'endpoints.allStatus': 'All statuses',
  'endpoints.search': 'Search by name',
  'endpoints.empty': 'No endpoints match the filters',
  'endpoints.col.name': 'Name',
  'endpoints.col.id': 'Endpoint ID',
  'endpoints.col.status': 'Status',
  'endpoints.col.model': 'Model',
  'endpoints.col.project': 'Project',
  'endpoints.col.rate': 'RPM / TPM',
  'endpoints.col.created': 'Created',
  'endpoints.detail.description': 'Description',
  'endpoints.detail.modelType': 'Model type',
  'endpoints.detail.updated': 'Updated',
  'endpoints.detail.rolling': 'Supports rolling update',
  'endpoints.detail.tags': 'Tags',
  'endpoints.detail.statusReason': 'Status reason',
  'endpoints.yes': 'Yes',
  'endpoints.no': 'No',

  'accounts.title': 'Accounts',
  'accounts.subtitle': 'AK/SK stay in local config files; the UI only shows masks',
  'accounts.add': 'Add account',
  'accounts.col.name': 'Name',
  'accounts.col.project': 'Project',
  'accounts.col.ak': 'AK',
  'accounts.col.status': 'Status',
  'accounts.col.note': 'Note',
  'accounts.enabled': 'Enabled',
  'accounts.disabled': 'Disabled',
  'accounts.verify': 'Verify',
  'accounts.edit': 'Edit',
  'accounts.empty': 'No accounts yet. Use “Add account” to enter AK/SK and project.',
  'accounts.verify.checking': 'Verifying…',
  'accounts.verify.ok': 'Access OK · project {project} · {total} endpoints',
  'accounts.verify.fail': 'Verification failed',

  'form.createTitle': 'Add account',
  'form.editTitle': 'Edit {name}',
  'form.name': 'Account name',
  'form.nameHint': 'Also the config file name; cannot be changed later',
  'form.label': 'Display name (optional)',
  'form.labelPlaceholder': 'Primary account',
  'form.ak': 'Access Key ID',
  'form.akKeep': '(leave blank to keep current)',
  'form.sk': 'Secret Access Key',
  'form.skKeep': '(leave blank to keep current)',
  'form.skPlaceholderKeep': 'Leave blank to keep current',
  'form.skHint': 'Stored in local configs/accounts; never shown in the UI',
  'form.project': 'Project (optional)',
  'form.projectPlaceholder': 'Defaults to the account name',
  'form.projectHint': 'Ark permissions are project-scoped; must match the IAM grant',
  'form.note': 'Note (optional)',
  'form.enabled': 'Enabled',
  'form.err.name': 'Only letters, digits and hyphens are allowed',
  'form.err.akSk': 'Both AK and SK are required',
  'form.err.akForSk': 'AK is also required when changing SK',
  'form.err.save': 'Save failed, please check the fields',

  'delete.title': 'Delete account {name}',
  'delete.warning':
    'This deletes the local config file. AK/SK cannot be recovered from the UI and must be regenerated in the console. Type the account name to confirm.',
  'delete.label': 'Account name',
  'delete.mismatch': 'The name does not match',
  'delete.failed': 'Delete failed',

  'breakdown.title': 'Usage detail',
  'breakdown.byEndpoint': 'By endpoint',
  'breakdown.byModel': 'By model',
  'breakdown.col.name': 'Name / Endpoint ID',
  'breakdown.col.endpoints': 'Endpoints',
  'breakdown.col.count': '{n}',
  'breakdown.loading': 'Loading detail…',
  'breakdown.noUsage': 'No usage',
  'breakdown.unattributed': 'Unattributed',
  'breakdown.unattributedHint': 'Ark usage rows without an endpoint reference',
  'breakdown.fallback': 'Ark did not return the endpoint column; queried each endpoint instead.',
  'breakdown.emptyEndpoints': 'This account has no endpoints in this project.',
  'breakdown.endpointNoUsage': 'No calls for this endpoint in the selected range.',
  'breakdown.failed': 'Failed to load detail',

  'chart.aria': 'Daily token usage bar chart',
  'chart.title': 'Daily total tokens',
  'chart.days': '{n} days',
  'chart.tooltip': '{day} total {total} · input {input} · output {output} · requests {requests}',
};

const DICTS: Record<Lang, Dict> = { zh, en };

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // localStorage 不可用时按浏览器语言判断
  }
  return (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  te: (code: string | undefined, fallback: unknown) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // 忽略写入失败
    }
  }, [lang]);

  const value = useMemo<I18nContextValue>(() => {
    const dict = DICTS[lang];

    const t = (key: string, params?: Record<string, string | number>) => {
      let text = dict[key] ?? DICTS.zh[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replaceAll(`{${k}}`, String(v));
        }
      }
      return text;
    };

    const te = (code: string | undefined, fallback: unknown) => {
      const key = code ? `error.${code.replaceAll('.', '_')}` : '';
      if (key && dict[key]) return t(key);
      if (lang === 'zh' && typeof fallback === 'string') return fallback;
      return t('error.generic');
    };

    return { lang, setLang: setLangState, t, te };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

// 数字格式化随语言切换
export function formatTokens(value: number, lang: Lang): string {
  return value.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US');
}

export function formatShort(value: number, lang: Lang): string {
  if (value >= 1e8)
    return lang === 'zh' ? `约 ${(value / 1e8).toFixed(2)} 亿` : `~${(value / 1e8).toFixed(2)}B`;
  if (value >= 1e4)
    return lang === 'zh' ? `约 ${(value / 1e4).toFixed(1)} 万` : `~${(value / 1e4).toFixed(1)}K`;
  return '';
}
