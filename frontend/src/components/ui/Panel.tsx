import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { FadeIn, Stagger } from '@/components/motion';

/**
 * Panneau de contenu : le grand conteneur gris arrondi qui porte les cartes.
 *
 * C'est lui qui donne aux pages leur « contour » commun : en-tête à l'extérieur,
 * tout le reste à l'intérieur, sur un plan légèrement en retrait du fond.
 */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('panel space-y-4 p-4 sm:p-6', className)}>{children}</div>;
}

/**
 * Rangée de tuiles indicateurs en tête de panneau, avec entrée en cascade.
 * Trois colonnes par défaut — la grille du tableau de bord.
 */
export function KpiRow({
  children,
  columns = 3,
  className,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const grid = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'sm:grid-cols-2 xl:grid-cols-4',
  }[columns];

  return <Stagger className={cn('grid gap-4', grid, className)}>{children}</Stagger>;
}

export { FadeIn as KpiSlot };

/**
 * Onglets en pilules — remplacent les onglets soulignés sur les fiches.
 */
export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: ReadonlyArray<{ id: T; label: string; count?: number }>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <nav className={cn('flex flex-wrap gap-2', className)} aria-label="Sections">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-11 items-center gap-2 rounded-pill px-5 text-sm font-semibold transition-all',
              active
                ? 'bg-gradient-brand text-white shadow-glow-brand'
                : 'bg-white text-ink-soft hover:bg-slate-50 dark:bg-night-700 dark:text-slate-300 dark:hover:bg-night-600',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'rounded-pill px-2 py-0.5 text-[11px] font-bold',
                  active ? 'bg-white/25 text-white' : 'bg-slate-100 text-ink-muted dark:bg-white/10',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
