import { useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  refreshing?: boolean;
  loading?: boolean;
  empty?: boolean;
  emptyLabel?: string;
  /** Vue tabulaire équivalente — toujours fournie pour un graphique. */
  table?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/**
 * Conteneur d'un graphique : titre, action à droite, bascule tableau.
 * Au rafraîchissement, le rendu précédent reste visible atténué — pas de
 * squelette qui clignote.
 */
export function ChartCard({
  title,
  subtitle,
  action,
  refreshing = false,
  loading = false,
  empty = false,
  emptyLabel = 'Aucune donnée',
  table,
  children,
  className,
  bodyClassName,
}: ChartCardProps) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section
      className={cn('card flex flex-col transition-shadow duration-300 hover:shadow-card-hover', className)}
      aria-busy={loading || refreshing || undefined}
    >
      <header className="flex items-start justify-between gap-3 px-6 pb-2 pt-6">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-ink dark:text-white">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {action}
          {table && !loading && !empty && (
            <button
              type="button"
              onClick={() => setShowTable((value) => !value)}
              aria-pressed={showTable}
              className={cn(
                'pill-outline h-9 px-3.5 text-xs font-semibold transition-colors',
                showTable
                  ? '!border-ink !bg-ink !text-white dark:!border-white dark:!bg-white dark:!text-ink'
                  : 'hover:bg-slate-50 dark:hover:bg-white/5',
              )}
            >
              {showTable ? 'Graphique' : 'Tableau'}
            </button>
          )}
        </div>
      </header>

      <div
        className={cn(
          'flex-1 px-6 pb-6 pt-3 transition-opacity duration-300',
          refreshing && 'opacity-50',
          bodyClassName,
        )}
      >
        {loading ? (
          <ChartPlaceholder />
        ) : empty ? (
          <p className="flex h-full min-h-32 items-center justify-center text-sm text-ink-muted">
            {emptyLabel}
          </p>
        ) : showTable && table ? (
          <div className="overflow-x-auto text-sm">{table}</div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function ChartPlaceholder() {
  return (
    <div className="flex h-full min-h-32 flex-col justify-end gap-2.5" aria-hidden="true">
      {[70, 45, 85, 30, 60].map((width, index) => (
        <div
          key={index}
          className="shimmer h-3.5 rounded-pill"
          style={{ width: `${width}%`, animationDelay: `${index * 80}ms` }}
        />
      ))}
    </div>
  );
}

/** Tableau minimal, jumeau accessible d'un graphique simple. */
export function SimpleTable({
  rows,
  columns = ['Catégorie', 'Valeur'],
}: {
  rows: Array<{ label: ReactNode; value: ReactNode; extra?: ReactNode }>;
  columns?: string[];
}) {
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted dark:border-white/5">
          {columns.map((column, index) => (
            <th key={column} className={cn('pb-2', index > 0 && 'text-right')}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50 dark:divide-white/5">
        {rows.map((row, index) => (
          <tr key={index}>
            <td className="py-2.5 text-ink-soft dark:text-slate-300">{row.label}</td>
            <td className="tabular py-2.5 text-right font-semibold text-ink dark:text-white">{row.value}</td>
            {row.extra !== undefined && (
              <td className="tabular py-2.5 text-right text-ink-muted">{row.extra}</td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
