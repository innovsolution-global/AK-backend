import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { TableSkeleton } from '@/components/ui/feedback';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  className?: string;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  sort?: string;
  order?: 'asc' | 'desc';
  onSortChange?: (field: string) => void;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  empty,
  onRowClick,
  sort,
  order = 'desc',
  onSortChange,
}: DataTableProps<T>) {
  if (loading) return <TableSkeleton cols={columns.length} />;
  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-100 dark:border-white/5">
            {columns.map((column) => {
              const isSorted = sort === column.key;

              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={isSorted ? (order === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn(
                    'whitespace-nowrap px-5 py-3.5 text-xs font-semibold text-ink-muted',
                    column.align === 'right' && 'text-right',
                    column.align === 'center' && 'text-center',
                    column.align !== 'right' && column.align !== 'center' && 'text-left',
                    column.className,
                  )}
                >
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(column.key)}
                      className="inline-flex items-center gap-1 transition-colors hover:text-ink dark:hover:text-white"
                    >
                      {column.header}
                      <SortIndicator active={isSorted} order={order} />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-white/5">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                onRowClick && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.03]',
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'px-5 py-4 text-ink-soft dark:text-slate-300',
                    column.align === 'right' && 'text-right tabular',
                    column.align === 'center' && 'text-center',
                    column.className,
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortIndicator({ active, order }: { active: boolean; order: 'asc' | 'desc' }) {
  return (
    <svg
      className={cn('h-3 w-3', active ? 'text-brand-500' : 'text-slate-300 dark:text-slate-600')}
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
    >
      {(!active || order === 'asc') && <path d="M6 2l3 4H3l3-4z" />}
      {(!active || order === 'desc') && <path d="M6 10L3 6h6l-3 4z" />}
    </svg>
  );
}
