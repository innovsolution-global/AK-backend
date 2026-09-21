import { useQuery } from '@tanstack/react-query';
import { auditApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Alert, EmptyState, ErrorState } from '@/components/ui/feedback';
import { DataTable } from '@/components/data/DataTable';
import { Pagination } from '@/components/data/Pagination';
import { useListParams } from '@/hooks/useListParams';
import { formatDateTime, humanizeEnum } from '@/utils/format';

const ACTIONS = [
  'LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'UPLOAD', 'DOWNLOAD',
  'SHARE', 'REVOKE_SHARE', 'VIEW', 'PASSWORD_CHANGE',
];

export default function AuditPage() {
  const { params, update, setPage } = useListParams({ sort: 'createdAt' });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.audit.list(params),
    queryFn: () => auditApi.list(params),
    placeholderData: (previous) => previous,
  });

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div>
      <PageHeader
        icon="audit"
        title="Journal d'audit"
        description={data ? `${data.meta.total} entrée(s)` : undefined}
      />

      <Panel>
        <Alert tone="info">
          Ce journal est en écriture seule : aucune entrée ne peut être modifiée ni supprimée, y
          compris par un administrateur.
        </Alert>

        <div className="card overflow-hidden">
          <div className="flex flex-col gap-3 p-5 sm:flex-row">
            <input
              type="search"
              defaultValue={params.search ?? ''}
              onChange={(event) => update({ search: event.target.value })}
              placeholder="Entité, identifiant, email…"
              className="pill-outline h-11 flex-1 px-5 text-sm placeholder:text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />

            <select
              value={String(params.action ?? '')}
              onChange={(event) => update({ action: event.target.value })}
              className="pill-outline h-11 px-4 text-sm font-medium"
            >
              <option value="">Toutes les actions</option>
              {ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {humanizeEnum(action)}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={String(params.from ?? '')}
              onChange={(event) => update({ from: event.target.value })}
              className="pill-outline h-11 px-4 text-sm font-medium"
              aria-label="Depuis"
            />
          </div>

          <DataTable
            columns={[
              {
                key: 'createdAt',
                header: 'Date',
                render: (row) => <span className="tabular whitespace-nowrap">{formatDateTime(row.createdAt)}</span>,
              },
              {
                key: 'user',
                header: 'Utilisateur',
                render: (row) =>
                  row.user ? (
                    <div>
                      <p className="font-semibold text-ink dark:text-white">
                        {row.user.firstName} {row.user.lastName}
                      </p>
                      <p className="text-xs text-ink-muted">{row.user.email}</p>
                    </div>
                  ) : (
                    <span className="text-ink-muted">Système</span>
                  ),
              },
              {
                key: 'action',
                header: 'Action',
                render: (row) => (
                  <span className="rounded-pill bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink-soft dark:bg-white/10 dark:text-slate-300">
                    {humanizeEnum(row.action)}
                  </span>
                ),
              },
              {
                key: 'entity',
                header: 'Ressource',
                render: (row) => (
                  <div>
                    <p>{row.entity}</p>
                    {row.entityId && <p className="truncate text-xs text-ink-muted">{row.entityId}</p>}
                  </div>
                ),
              },
              {
                key: 'ip',
                header: 'Origine',
                render: (row) => <span className="tabular text-xs text-ink-muted">{row.ip ?? '—'}</span>,
              },
            ]}
            rows={data?.data ?? []}
            rowKey={(row) => row.id}
            loading={isLoading}
            empty={
              <EmptyState
                title="Aucune entrée"
                description="Aucune action ne correspond à ces critères."
                icon={<Icon name="audit" className="h-8 w-8" />}
              />
            }
          />

          {data && <Pagination meta={data.meta} onPageChange={setPage} />}
        </div>
      </Panel>
    </div>
  );
}
