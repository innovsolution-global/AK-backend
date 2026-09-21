import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi, sharesApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiRow, KpiSlot, Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { KpiCard } from '@/components/charts/KpiCard';
import { DataTable } from '@/components/data/DataTable';
import { Pagination } from '@/components/data/Pagination';
import { useListParams } from '@/hooks/useListParams';
import { formatDate, formatDateTime, humanizeEnum } from '@/utils/format';
import { SHARE_STATUSES } from '@/types/domain';

export default function SharesPage() {
  const { params, update, setPage, reset, hasFilters } = useListParams({ sort: 'createdAt' });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.shares.list(params),
    queryFn: () => sharesApi.list(params),
    placeholderData: (previous) => previous,
  });

  const overview = useQuery({
    queryKey: queryKeys.dashboard.overview(),
    queryFn: dashboardApi.overview,
    staleTime: 60_000,
  });

  const activity = useQuery({
    queryKey: queryKeys.dashboard.activity(),
    queryFn: dashboardApi.activity,
    staleTime: 60_000,
  });

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const expiring = overview.data?.shares.expiringSoon ?? 0;
  const pending = activity.data?.pendingShares ?? 0;

  return (
    <div>
      <PageHeader
        icon="share"
        title="Partages"
        description={data ? `${data.meta.total} partage(s) sur votre périmètre` : undefined}
      />

      <Panel>
        <KpiRow>
          <KpiSlot>
            <KpiCard
              icon="share"
              label="Accès actifs"
              value={overview.data?.shares.active ?? 0}
              loading={overview.isLoading}
              onClick={() => update({ status: 'ACTIVE' })}
            />
          </KpiSlot>
          <KpiSlot>
            <KpiCard
              icon="calendar"
              label="Expirent sous 7 jours"
              value={expiring}
              loading={overview.isLoading}
              delta={expiring > 0 ? { value: 'à renouveler', good: false } : undefined}
              hint={expiring === 0 ? 'Aucune échéance proche' : undefined}
              onClick={() => update({ status: 'ACTIVE' })}
            />
          </KpiSlot>
          <KpiSlot>
            <KpiCard
              icon="bell"
              label="Invitations en attente"
              value={pending}
              loading={activity.isLoading}
              hint={pending === 0 ? 'Toutes les invitations sont activées' : 'Non encore activées'}
              onClick={() => update({ status: 'PENDING' })}
            />
          </KpiSlot>
        </KpiRow>

        <div className="card overflow-hidden">
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
            <input
              type="search"
              defaultValue={params.search ?? ''}
              onChange={(event) => update({ search: event.target.value })}
              placeholder="Email, nom, référence du bien…"
              className="pill-outline h-11 flex-1 px-5 text-sm placeholder:text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />

            <select
              value={String(params.status ?? '')}
              onChange={(event) => update({ status: event.target.value })}
              className="pill-outline h-11 px-4 text-sm font-medium"
            >
              <option value="">Tous les statuts</option>
              {SHARE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {humanizeEnum(status)}
                </option>
              ))}
            </select>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={reset}>
                Réinitialiser
              </Button>
            )}
          </div>

          <DataTable
            columns={[
              {
                key: 'beneficiary',
                header: 'Bénéficiaire',
                render: (row) => (
                  <div>
                    <p className="font-semibold text-ink dark:text-white">
                      {row.beneficiaryFirstName} {row.beneficiaryLastName}
                    </p>
                    <p className="text-xs text-ink-muted">{row.beneficiaryEmail}</p>
                  </div>
                ),
              },
              {
                key: 'property',
                header: 'Bien',
                render: (row) => (
                  <Link
                    to={`/properties/${row.property.id}?tab=shares`}
                    className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                  >
                    {row.property.reference}
                  </Link>
                ),
              },
              {
                key: 'status',
                header: 'Statut',
                render: (row) => <StatusBadge status={row.status} kind="share" />,
              },
              {
                key: 'expiresAt',
                header: 'Expire le',
                align: 'right',
                render: (row) => formatDate(row.expiresAt),
              },
              {
                key: 'lastAccessedAt',
                header: 'Dernière consultation',
                align: 'right',
                render: (row) =>
                  row.lastAccessedAt ? formatDateTime(row.lastAccessedAt) : <span className="text-ink-muted">Jamais</span>,
              },
            ]}
            rows={data?.data ?? []}
            rowKey={(row) => row.id}
            loading={isLoading}
            empty={
              <EmptyState
                title="Aucun partage"
                description="Les partages se créent depuis la fiche d'un terrain, onglet « Partages »."
                icon={<Icon name="share" className="h-8 w-8" />}
              />
            }
          />

          {data && <Pagination meta={data.meta} onPageChange={setPage} />}
        </div>
      </Panel>
    </div>
  );
}
