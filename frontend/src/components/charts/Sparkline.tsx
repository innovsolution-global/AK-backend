import { useId } from 'react';
import { MARK, useChartTheme } from './theme';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  highlightLast?: boolean;
}

/** Micro-tendance d'une tuile : douze points, sans axes, période courante marquée. */
export function Sparkline({ values, width = 96, height = 28, highlightLast = true }: SparklineProps) {
  const theme = useChartTheme();
  const gradientId = useId().replace(/:/g, '');

  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const padding = 3;

  const points = values.map((value, index) => {
    const x = padding + (index / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return [x, y] as const;
  });

  const path = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
  const last = points[points.length - 1];
  const first = points[0];
  const area = `${path} L${last?.[0].toFixed(1)},${height} L${first?.[0].toFixed(1)},${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={theme.series} stopOpacity={0.14} />
          <stop offset="100%" stopColor={theme.series} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={path} fill="none" stroke={theme.muted} strokeWidth={MARK.lineWidth} strokeLinejoin="round" strokeLinecap="round" />
      {highlightLast && last && (
        <circle cx={last[0]} cy={last[1]} r={MARK.dotRadius} fill={theme.series} stroke={theme.surface} strokeWidth={MARK.gap} />
      )}
    </svg>
  );
}
