import { useState } from 'react';
import { UsageRow } from '../api';
import { Granularity, hourKeys, usageKey } from '../usage-keys';
import { formatTokens, useI18n } from '../i18n';

type Props = {
  rows: UsageRow[];
  days: string[];
  granularity?: Granularity;
};

// 逐日/逐小时柱状图：每根柱一个时间槽位，唯一图表色；数值用完整千分位
export function DailyBars({ rows, days, granularity = 'day' }: Props) {
  const { t, lang } = useI18n();
  const [hovered, setHovered] = useState<number | null>(null);
  const keys = granularity === 'day' ? days : hourKeys(days);
  const byKey = new Map(rows.map((r) => [usageKey(r, granularity), r]));
  const values = keys.map((k) => Number(byKey.get(k)?.TotalTokens ?? 0));
  const max = Math.max(...values, 1);

  const W = 720;
  const H = 140;
  const padBottom = 18;
  const chartH = H - padBottom;
  const slot = W / Math.max(keys.length, 1);
  const barW = Math.max(Math.min(slot * 0.62, 28), 3);

  const ticks = [0, max / 2, max];

  const isSingleDayHour = granularity === 'hour' && days.length === 1;

  const labelIndexes =
    granularity === 'day'
      ? keys
          .map((_, i) => i)
          .filter(
            (i) => i === 0 || i === keys.length - 1 || i === Math.floor((keys.length - 1) / 2),
          )
      : isSingleDayHour
        ? [0, 6, 12, 18, 23]
        : keys.map((k, i) => (k.endsWith(' 00') ? i : -1)).filter((i) => i >= 0);

  const labelText = (key: string) => {
    if (granularity === 'day') return key.slice(5);
    if (isSingleDayHour) return `${key.slice(11)}:00`;
    return key.slice(5, 10);
  };

  const displayKey = (key: string) => (granularity === 'day' ? key : `${key.slice(5)}:00`);

  return (
    <div className="chart-block">
      <div className="chart-meta">
        <span>{t(granularity === 'hour' ? 'chart.titleHour' : 'chart.title')}</span>
        <span>
          {t(granularity === 'hour' ? 'chart.hours' : 'chart.days', {
            n: granularity === 'hour' ? keys.length : days.length,
          })}
        </span>
      </div>
      <svg
        className="chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t(granularity === 'hour' ? 'chart.ariaHour' : 'chart.aria')}
      >
        {ticks.map((tick, i) => {
          const y = chartH - (tick / max) * chartH;
          return (
            <g key={i}>
              <line className="grid-line" x1={0} x2={W} y1={y} y2={y} />
              <text className="axis-text" x={2} y={Math.max(y - 4, 8)}>
                {formatTokens(Math.round(tick), lang)}
              </text>
            </g>
          );
        })}
        {keys.map((key, i) => {
          const value = values[i];
          const h = (value / max) * chartH;
          const x = i * slot + (slot - barW) / 2;
          const y = chartH - h;
          const row = byKey.get(key);
          const tooltip = t('chart.tooltip', {
            day: displayKey(key),
            total: formatTokens(value, lang),
            input: formatTokens(Number(row?.InputTokens ?? 0), lang),
            output: formatTokens(Number(row?.OutputTokens ?? 0), lang),
            requests: formatTokens(Number(row?.ReqCnt ?? 0), lang),
          });
          return (
            <g key={key} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
              <rect
                className={value > 0 ? 'bar' : 'bar-zero'}
                x={x}
                y={value > 0 ? y : chartH - 1}
                width={barW}
                height={value > 0 ? Math.max(h, 1.5) : 1.5}
                rx={1}
                opacity={hovered === null || hovered === i ? 1 : 0.55}
              >
                <title>{tooltip}</title>
              </rect>
            </g>
          );
        })}
        {labelIndexes.map((i, order) => (
          <text
            key={`label-${keys[i]}`}
            className="axis-text"
            x={i * slot + slot / 2}
            y={H - 4}
            textAnchor={
              order === 0 ? 'start' : order === labelIndexes.length - 1 ? 'end' : 'middle'
            }
          >
            {labelText(keys[i])}
          </text>
        ))}
      </svg>
    </div>
  );
}
