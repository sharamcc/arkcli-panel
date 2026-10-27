import { useState } from 'react';
import { UsageRow } from '../api';
import { formatTokens, useI18n } from '../i18n';

type Props = {
  rows: UsageRow[];
  days: string[];
};

// 逐日柱状图：每天一根柱，唯一图表色；数值用完整千分位
export function DailyBars({ rows, days }: Props) {
  const { t, lang } = useI18n();
  const [hovered, setHovered] = useState<number | null>(null);
  const byDay = new Map(rows.map((r) => [String(r.Day), r]));
  const values = days.map((d) => Number(byDay.get(d)?.TotalTokens ?? 0));
  const max = Math.max(...values, 1);

  const W = 720;
  const H = 140;
  const padBottom = 18;
  const chartH = H - padBottom;
  const slot = W / Math.max(days.length, 1);
  const barW = Math.max(Math.min(slot * 0.62, 28), 3);

  const ticks = [0, max / 2, max];

  return (
    <div className="chart-block">
      <div className="chart-meta">
        <span>{t('chart.title')}</span>
        <span>{t('chart.days', { n: days.length })}</span>
      </div>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('chart.aria')}>
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
        {days.map((day, i) => {
          const value = values[i];
          const h = (value / max) * chartH;
          const x = i * slot + (slot - barW) / 2;
          const y = chartH - h;
          const row = byDay.get(day);
          const tooltip = t('chart.tooltip', {
            day,
            total: formatTokens(value, lang),
            input: formatTokens(Number(row?.InputTokens ?? 0), lang),
            output: formatTokens(Number(row?.OutputTokens ?? 0), lang),
            requests: formatTokens(Number(row?.ReqCnt ?? 0), lang),
          });
          return (
            <g key={day} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
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
        {days.map((day, i) => {
          if (i !== 0 && i !== days.length - 1 && i !== Math.floor((days.length - 1) / 2))
            return null;
          return (
            <text
              key={`label-${day}`}
              className="axis-text"
              x={i * slot + slot / 2}
              y={H - 4}
              textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}
            >
              {day.slice(5)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
