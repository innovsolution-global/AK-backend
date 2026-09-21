import { useQuery } from '@tanstack/react-query';
import { dashboardApi, locationsApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiRow, KpiSlot, Panel } from '@/components/ui/Panel';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { KpiCard } from '@/components/charts/KpiCard';
import { DataTable } from '@/components/data/DataTable';
import { Pagination } from '@/components/data/Pagination';
import { useAuth } from '@/hooks/useAuth';
import { useListParams } from '@/hooks/useListParams';
import { humanizeEnum } from '@/utils/format';

export default function LocationsPage() {
  const { can } = useAuth();
  const { params, update, setPage } = useListParams({ sort: 'name', order: 'asc' });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.locations.list(params),
    queryFn: () => locationsApi.list(params),
    placeholderData: (previous) => previous,
  });

  const overview = useQuery({
    queryKey: queryKeys.dashboard.overview(),
    queryFn: dashboardApi.overview,
    enabled: can('dashboard.read'),
    staleTime: 60_000,
  });

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div>
      <PageHeader
        icon="city"
        title="Villes et préfectures"
        description={data ? `${data.meta.total} localité(s)` : undefined}
      />

      <Panel>
        {overview.data && (
          <KpiRow>
            <KpiSlot>
              <KpiCard icon="city" label="Villes" value={overview.data.geography.locations} />
            </KpiSlot>
            <KpiSlot>
              <KpiCard icon="site" label="Sites" value={overview.data.geography.sites} />
            </KpiSlot>
            <KpiSlot>
              <KpiCard icon="land" label="Terrains" value={overview.data.properties.total} />
            </KpiSlot>
          </KpiRow>
        )}

        <div className="card overflow-hidden">
          <div className="p-5">
            <input
              type="search"
              defaultValue={params.search ?? ''}
              onChange={(event) => update({ search: event.target.value })}
              placeholder="Nom ou code…"
              className="pill-outline h-11 w-full px-5 text-sm placeholder:text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:max-w-sm"
            />
          </div>

          <DataTable
            columns={[
              {
                key: 'name',
                header: 'Nom',
                render: (row) => <span className="font-semibold text-ink dark:text-white">{row.name}</span>,
              },
              {
                key: 'code',
                header: 'Code',
                render: (row) => (
                  <span className="tabular rounded-pill bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink-soft dark:bg-white/10 dark:text-slate-300">
                    {row.code}
                  </span>
                ),
              },
              { key: 'type', header: 'Type', render: (row) => humanizeEnum(row.type) },
              { key: 'sites', header: 'Sites', align: 'right', render: (row) => row._count.sites },
              { key: 'properties', header: 'Terrains', align: 'right', render: (row) => row._count.properties },
            ]}
            rows={data?.data ?? []}
            rowKey={(row) => row.id}
            loading={isLoading}
            empty={
              <EmptyState
                title="Aucune localité"
                description="Les villes structurent le patrimoine : créez-en une pour commencer."
                icon={<Icon name="city" className="h-8 w-8" />}
              />
            }
          />

          {data && <Pagination meta={data.meta} onPageChange={setPage} />}
        </div>
      </Panel>
    </div>
  );
}
