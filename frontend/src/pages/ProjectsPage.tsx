import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi, projectsApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiRow, KpiSlot, Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { KpiCard } from '@/components/charts/KpiCard';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Pagination } from '@/components/data/Pagination';
import { useAuth } from '@/hooks/useAuth';
import { useListParams } from '@/hooks/useListParams';
import { formatDate, humanizeEnum } from '@/utils/format';
import { PROJECT_STATUSES, type ProjectListItem } from '@/types/domain';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { params, update, setPage, toggleSort, reset, hasFilters } = useListParams({
    sort: 'createdAt',
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.projects.list(params),
    queryFn: () => projectsApi.list(params),
    placeholderData: (previous) => previous,
  });

  const overview = useQuery({
    queryKey: queryKeys.dashboard.overview(),
    queryFn: dashboardApi.overview,
    enabled: can('dashboard.read'),
    staleTime: 60_000,
  });

  const countOf = (status: string) =>
    overview.data?.projects.byStatus.find((row) => row.key === status)?.count ?? 0;
  const inWorks = countOf('TRAVAUX_EN_COURS') + countOf('TRAVAUX_PREPARATION');
  const finished = countOf('TERMINE');
  const awaitingPermit = countOf('EN_ATTENTE_PERMIS');

  const columns: Array<Column<ProjectListItem>> = [
    {
      key: 'reference',
      header: 'Référence',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-semibold text-ink dark:text-white">{row.reference}</p>
          <p className="text-xs text-ink-muted">{row.name}</p>
        </div>
      ),
    },
    {
      key: 'property',
      header: 'Domaine',
      render: (row) =>
        row.property ? <span>{row.property.reference}</span> : <span className="text-ink-muted">Non rattaché</span>,
    },
    {
      key: 'location',
      header: 'Localisation',
      render: (row) => (
        <div>
          <p>{row.location.name}</p>
          {row.site && <p className="text-xs text-ink-muted">{row.site.name}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      sortable: true,
      render: (row) => <StatusBadge status={row.status} kind="project" />,
    },
    {
      key: 'company',
      header: 'Entreprise',
      render: (row) =>
        row.company ? <span>{row.company.name}</span> : <span className="text-ink-muted">—</span>,
    },
    {
      key: 'counts',
      header: 'Composition',
      align: 'center',
      render: (row) => (
        <span className="rounded-pill bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink-soft dark:bg-white/10 dark:text-slate-300">
          {row._count.components} comp. · {row._count.permits} permis
        </span>
      ),
    },
    {
      key: 'expectedEndDate',
      header: 'Fin prévue',
      sortable: true,
      align: 'right',
      render: (row) => formatDate(row.expectedEndDate),
    },
  ];

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div>
      <PageHeader
        icon="project"
        title="Projets"
        description={data ? `${data.meta.total} projet(s)` : undefined}
      />

      <Panel>
        {overview.data && (
          <KpiRow>
            <KpiSlot>
              <KpiCard
                icon="project"
                label="Projets"
                value={overview.data.projects.total}
                hint={`${finished} terminé(s)`}
              />
            </KpiSlot>
            <KpiSlot>
              <KpiCard
                icon="trendUp"
                label="En travaux"
                value={inWorks}
                delta={inWorks > 0 ? { value: 'chantiers actifs', good: true } : undefined}
                hint={inWorks === 0 ? 'Aucun chantier en cours' : undefined}
                onClick={() => update({ status: 'TRAVAUX_EN_COURS' })}
              />
            </KpiSlot>
            <KpiSlot>
              <KpiCard
                icon="document"
                label="En attente de permis"
                value={awaitingPermit}
                delta={awaitingPermit > 0 ? { value: 'à suivre', good: false } : undefined}
                hint={awaitingPermit === 0 ? 'Aucun dossier en attente' : undefined}
                onClick={() => update({ status: 'EN_ATTENTE_PERMIS' })}
              />
            </KpiSlot>
          </KpiRow>
        )}

        <div className="card overflow-hidden">
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
            <input
              type="search"
              defaultValue={params.search ?? ''}
              onChange={(event) => update({ search: event.target.value })}
              placeholder="Référence ou nom…"
              className="pill-outline h-11 flex-1 px-5 text-sm placeholder:text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />

            <select
              value={String(params.status ?? '')}
              onChange={(event) => update({ status: event.target.value })}
              className="pill-outline h-11 px-4 text-sm font-medium"
            >
              <option value="">Tous les statuts</option>
              {PROJECT_STATUSES.map((status) => (
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
            columns={columns}
            rows={data?.data ?? []}
            rowKey={(row) => row.id}
            loading={isLoading}
            sort={params.sort}
            order={params.order}
            onSortChange={toggleSort}
            onRowClick={(row) => navigate(`/projects/${row.id}`)}
            empty={
              <EmptyState
                title={hasFilters ? 'Aucun projet ne correspond' : 'Aucun projet'}
                description={hasFilters ? 'Ajustez vos filtres.' : 'Les projets rattachés à vos domaines apparaîtront ici.'}
                icon={<Icon name="project" className="h-8 w-8" />}
              />
            }
          />

          {data && (
            <Pagination meta={data.meta} onPageChange={setPage} onLimitChange={(limit) => update({ limit })} />
          )}
        </div>
      </Panel>
    </div>
  );
}
