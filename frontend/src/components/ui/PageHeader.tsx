import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { cn } from '@/utils/cn';

type Tone = 'accent' | 'brand' | 'success' | 'ink';

const TILE_TONES: Record<Tone, string> = {
  accent: 'bg-accent-600 shadow-glow-accent',
  brand: 'bg-gradient-brand shadow-glow-brand',
  success: 'bg-gradient-success shadow-glow-success',
  ink: 'bg-ink shadow-card dark:bg-white dark:text-ink',
};

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Carré coloré à gauche du titre — la signature des en-têtes de page. */
  icon?: IconName;
  tone?: Tone;
  actions?: ReactNode;
  backTo?: { to: string; label: string };
}

export function PageHeader({
  title,
  description,
  icon,
  tone = 'accent',
  actions,
  backTo,
}: PageHeaderProps) {
  return (
    <div className="mb-6">
      {backTo && (
        <Link
          to={backTo.to}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink dark:hover:text-white"
        >
          <Icon name="arrowLeft" className="h-4 w-4" />
          {backTo.label}
        </Link>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {icon && (
            <div className={cn('icon-tile', TILE_TONES[tone])}>
              <Icon name={icon} className="h-6 w-6" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-ink dark:text-white">
              {title}
            </h1>
            {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'warning';
}

export function StatCard({ label, value, hint, tone = 'default' }: StatCardProps) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p
        className={
          tone === 'warning'
            ? 'mt-1.5 text-2xl font-bold text-amber-600'
            : 'mt-1.5 text-2xl font-bold text-ink dark:text-white'
        }
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
