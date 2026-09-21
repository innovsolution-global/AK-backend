import { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MARK, animationDuration, axisTick, useChartTheme, type ChartTheme } from './theme';

export interface TrendPoint {
  label: string;
  fullLabel: string;
  value: number;
  secondary?: string;
  /** Point mis en avant (mois sélectionné). */
  active?: boolean;
}

interface AreaTrendProps {
  data: TrendPoint[];
  valueLabel: string;
  height?: number;
  formatValue?: (value: number) => string;
  onPointClick?: (index: number) => void;
}

/**
 * Tendance à une série.
 *
 * Trait de 2,5 px en dégradé jaune→orange, lavis à 10 %, grille hairline
 * continue. Le dégradé est un effet de surface sur une seule série : il ne code
 * rien, la couleur de série validée reste l'orange qui domine le tracé.
 */
export function AreaTrend({
  data,
  valueLabel,
  height = 220,
  formatValue = (value) => value.toLocaleString('fr-FR'),
  onPointClick,
}: AreaTrendProps) {
  const theme = useChartTheme();
  const id = useId().replace(/:/g, '');
  const max = Math.max(...data.map((point) => point.value), 0);

  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
          onClick={(state) => {
            const index = (state as { activeTooltipIndex?: number } | null)?.activeTooltipIndex;
            if (onPointClick && typeof index === 'number') onPointClick(index);
          }}
          style={{ cursor: onPointClick ? 'pointer' : undefined }}
        >
          <defs>
            <linearGradient id={`${id}-wash`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.series} stopOpacity={0.18} />
              <stop offset="100%" stopColor={theme.series} stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={theme.seriesGradient[0]} />
              <stop offset="100%" stopColor={theme.seriesGradient[1]} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={theme.grid} strokeWidth={1} vertical={false} strokeDasharray="" />

          <XAxis
            dataKey="label"
            tick={axisTick(theme)}
            tickLine={false}
            axisLine={{ stroke: theme.axis, strokeWidth: 1 }}
            interval="preserveStartEnd"
            minTickGap={28}
          />

          <YAxis
            tick={axisTick(theme)}
            tickLine={false}
            axisLine={false}
            width={32}
            allowDecimals={false}
            domain={[0, max === 0 ? 1 : 'auto']}
            tickFormatter={(value: number) => value.toLocaleString('fr-FR')}
          />

          <Tooltip
            cursor={{ stroke: theme.axis, strokeWidth: 1 }}
            content={({ active, payload }: TooltipContentProps) => (
              <TrendTooltip
                active={active}
                payload={payload}
                valueLabel={valueLabel}
                formatValue={formatValue}
                theme={theme}
              />
            )}
          />

          <Area
            type="monotone"
            dataKey="value"
            stroke={`url(#${id}-stroke)`}
            strokeWidth={MARK.lineWidth}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill={`url(#${id}-wash)`}
            dot={(props: DotProps) => {
              // Seul le point sélectionné porte un marqueur permanent ; les
              // autres n'apparaissent qu'au survol.
              if (!props.payload?.active) return <g key={props.index} />;
              return (
                <circle
                  key={props.index}
                  cx={props.cx}
                  cy={props.cy}
                  r={MARK.dotRadius + 2}
                  fill={theme.series}
                  stroke={theme.surface}
                  strokeWidth={MARK.gap}
                />
              );
            }}
            activeDot={{
              r: MARK.dotRadius + 1,
              fill: theme.series,
              stroke: theme.surface,
              strokeWidth: MARK.gap,
            }}
            isAnimationActive={animationDuration() > 0}
            animationDuration={animationDuration(900)}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: TrendPoint;
}

interface TooltipContentProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
}

function TrendTooltip({
  active,
  payload,
  valueLabel,
  formatValue,
  theme,
}: TooltipContentProps & {
  valueLabel: string;
  formatValue: (value: number) => string;
  theme: ChartTheme;
}) {
  const point = payload?.[0]?.payload as TrendPoint | undefined;
  if (!active || !point) return null;

  return (
    <div className="card px-3.5 py-2.5 shadow-card-hover">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {point.fullLabel}
      </p>
      <p className="mt-1 flex items-center gap-2 text-sm">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: theme.series }}
          aria-hidden="true"
        />
        <span className="text-ink-soft dark:text-slate-300">{valueLabel}</span>
        <span className="tabular ml-auto font-bold text-ink dark:text-white">
          {formatValue(point.value)}
        </span>
      </p>
      {point.secondary && <p className="mt-0.5 pl-4 text-xs text-ink-muted">{point.secondary}</p>}
    </div>
  );
}
