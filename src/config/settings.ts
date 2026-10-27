import fs from 'node:fs';
import path from 'node:path';

export type Lang = 'zh' | 'en';

const SETTINGS_FILE = path.resolve(process.cwd(), 'configs', 'settings.json');

let cached: Lang | null = null;

export function getLang(): Lang {
  if (cached) return cached;

  const env = process.env.PANEL_LANG;
  if (env === 'zh' || env === 'en') {
    cached = env;
    return cached;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    if (raw.lang === 'zh' || raw.lang === 'en') {
      const lang: Lang = raw.lang;
      cached = lang;
      return lang;
    }
  } catch {
    // 文件不存在或损坏时回退中文
  }

  cached = 'zh';
  return cached;
}

export function setLang(lang: Lang): void {
  cached = lang;
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  const tmp = `${SETTINGS_FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ lang }, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmp, SETTINGS_FILE);
}
