import { IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { PaginationMeta } from '@/api/types';

interface PaginationProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
}

const LIMITS = [20, 50, 100];

/**
 * Pagination : boutons ronds aux extrémités, page courante en pilule orange —
 * le motif du sélecteur de jours du design de référence.
 */
export function Pagination({ meta, onPageChange, onLimitChange }: PaginationProps) {
  const { page, limit, total, totalPages } = meta;

  if (total === 0) return null;

  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);
  const pages = visiblePages(page, totalPages);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 dark:border-white/5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 text-sm text-ink-muted">
        <span className="tabular">
          {first}–{last} sur {total.toLocaleString('fr-FR')}
        </span>

        {onLimitChange && (
          <label className="hidden items-center gap-1.5 text-xs sm:flex">
            Par page
            <select
              value={limit}
              onChange={(event) => onLimitChange(Number(event.target.value))}
              className="pill-outline h-8 px-2.5 text-xs"
            >
              {LIMITS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <nav className="flex items-center gap-1.5" aria-label="Pagination">
        <IconButton
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Page précédente"
        >
          <Icon name="chevronLeft" className="h-4 w-4" />
        </IconButton>

        {pages.map((value, index) =>
          value === null ? (
            <span key={`gap-${index}`} className="px-1 text-ink-muted">
              …
            </span>
          ) : (
            <IconButton
              key={value}
              size="sm"
              active={value === page}
              onClick={() => onPageChange(value)}
              aria-label={`Page ${value}`}
              aria-current={value === page ? 'page' : undefined}
              className="tabular text-sm font-semibold"
            >
              {value}
            </IconButton>
          ),
        )}

        <IconButton
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Page suivante"
        >
          <Icon name="chevronRight" className="h-4 w-4" />
        </IconButton>
      </nav>
    </div>
  );
}

/** Pages affichées : la courante, deux voisines de chaque côté, les bornes. */
function visiblePages(current: number, total: number): Array<number | null> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set<number>([1, total]);
  for (let i = current - 1; i <= current + 1; i += 1) {
    if (i >= 1 && i <= total) pages.add(i);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | null> = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const value = sorted[i]!;
    const previous = sorted[i - 1];
    if (previous !== undefined && value - previous > 1) result.push(null);
    result.push(value);
  }

  return result;
}
