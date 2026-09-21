import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { ApiError } from '@/api/types';
import { Button } from './Button';

/** Rectangle de chargement, aux dimensions du contenu attendu. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-2xl', className)} aria-hidden="true" />;
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-slate-100 dark:divide-white/5" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4 px-5 py-4">
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton key={colIndex} className={cn('h-4 rounded-full', colIndex === 0 ? 'w-32' : 'w-20')} />
          ))}
        </div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && (
        <div className="icon-disc mb-4 h-16 w-16 text-ink-muted dark:text-slate-400">{icon}</div>
      )}
      <p className="text-sm font-semibold text-ink dark:text-white">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ error, onRetry, className }: ErrorStateProps) {
  const message =
    error instanceof ApiError ? error.message : 'Une erreur inattendue est survenue.';
  const isNetwork = error instanceof ApiError && error.isNetworkError;

  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
      role="alert"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/15">
        <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-ink dark:text-white">{message}</p>
      {isNetwork && (
        <p className="mt-1 text-xs text-ink-muted">Vérifiez que le serveur est démarré.</p>
      )}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}

interface AlertProps {
  tone?: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Alert({ tone = 'info', title, children, className }: AlertProps) {
  const tones = {
    info: 'bg-accent-50 text-accent-700 border-accent-100 dark:bg-accent-500/10 dark:text-accent-400 dark:border-accent-500/20',
    warning: 'bg-amber-50 text-amber-900 border-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
    error: 'bg-red-50 text-red-900 border-red-100 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20',
    success: 'bg-success-50 text-success-700 border-success-100 dark:bg-success-500/10 dark:text-success-400 dark:border-success-500/20',
  };

  return (
    <div className={cn('rounded-2xl border px-4 py-3 text-sm', tones[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? 'mt-0.5' : undefined}>{children}</div>
    </div>
  );
}
