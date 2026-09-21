import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/format';

const POLL_INTERVAL_MS = 60_000;

export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: unread } = useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: notificationsApi.unreadCount,
    // Interrogation périodique plutôt qu'un canal temps réel : le volume de
    // notifications ne justifie pas d'ouvrir une connexion permanente.
    refetchInterval: POLL_INTERVAL_MS,
  });

  const { data: list, isLoading } = useQuery({
    queryKey: queryKeys.notifications.list({ limit: 10 }),
    queryFn: () => notificationsApi.list({ limit: 10 }),
    enabled: open,
  });

  const markAll = useMutation({
    mutationFn: notificationsApi.markAllAsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });

  const markOne = useMutation({
    mutationFn: notificationsApi.markAsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const count = unread?.count ?? 0;
  const items = list?.data ?? [];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 text-ink transition-colors hover:bg-slate-50 dark:border-white/15 dark:text-white dark:hover:bg-white/5"
        aria-label={`Notifications${count > 0 ? ` (${count} non lues)` : ''}`}
      >
        <Icon name="bell" className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-accent-500 ring-2 ring-white dark:ring-night-900" />
        )}
      </button>

      {open && (
        <div className="card absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden shadow-card-hover animate-fade-up">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-white/5">
            <p className="text-sm font-bold text-ink dark:text-white">
              Notifications
              {count > 0 && (
                <span className="ml-2 rounded-pill bg-accent-500 px-2 py-0.5 text-[11px] font-bold text-white">
                  {count}
                </span>
              )}
            </p>
            {count > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50"
              >
                Tout lire
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {isLoading && <p className="px-4 py-8 text-center text-sm text-ink-muted">Chargement…</p>}

            {!isLoading && items.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">Aucune notification</p>
            )}

            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (!item.readAt) markOne.mutate(item.id);
                }}
                className={cn(
                  'flex w-full gap-3 border-b border-slate-50 px-5 py-3.5 text-left transition-colors last:border-0 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5',
                  !item.readAt && 'bg-brand-50/60 dark:bg-brand-500/5',
                )}
              >
                <span
                  className={cn(
                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                    item.readAt ? 'bg-transparent' : 'bg-brand-500',
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink dark:text-white">{item.title}</span>
                  <span className="mt-0.5 block text-xs text-ink-soft dark:text-slate-300">{item.message}</span>
                  <span className="mt-1 block text-[11px] text-ink-muted">{formatRelative(item.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
