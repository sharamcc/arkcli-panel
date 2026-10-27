import { getLang, Lang } from '../config/settings.js';

type Params = Record<string, string | number>;

// 服务端日志/警告文案：跟随面板当前语言（configs/settings.json）
const MESSAGES: Record<string, Record<Lang, string>> = {
  'config.nameMismatch': {
    zh: '[config] {file}: name "{name}" 与文件名 "{expected}" 不一致，已跳过',
    en: '[config] {file}: name "{name}" does not match file name "{expected}", skipped',
  },
  'config.parseFailed': {
    zh: '[config] 解析 {file} 失败: {message}',
    en: '[config] failed to parse {file}: {message}',
  },
  'server.webDistMissing': {
    zh: 'web/dist 不存在，仅提供 API。先运行 npm run build 生成前端产物。',
    en: 'web/dist is missing; serving API only. Run npm run build to generate the frontend.',
  },
  'server.invalidWriteCidrs': {
    zh: '写来源配置 PANEL_WRITE_CIDRS 非法：{value}（{message}）',
    en: 'Invalid PANEL_WRITE_CIDRS: {value} ({message})',
  },
  'server.listening': {
    zh: 'arkcli-panel 已启动: http://{host}:{port}',
    en: 'arkcli-panel listening on http://{host}:{port}',
  },
};

export function tm(key: string, params: Params = {}, lang: Lang = getLang()): string {
  const entry = MESSAGES[key];
  if (!entry) return key;

  let text = entry[lang] ?? entry.zh;
  for (const [name, value] of Object.entries(params)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}
