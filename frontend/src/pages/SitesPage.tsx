import { useQuery } from '@tanstack/react-query';
import { locationsApi, sitesApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { DataTable } from '@/components/data/DataTable';
import { Pagination } from '@/components/data/Pagination';
import { useListParams } from '@/hooks/useListParams';

export default function SitesPage() {
  const { params, update, setPage } = useListParams({ sort: 'name', order: 'asc' });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.sites.list(params),
    queryFn: () => sitesApi.list(params),
    placeholderData: (previous) => previous,
  });

  const { data: locations } = useQuery({
    queryKey: queryKeys.locations.list({ type: 'VILLE' }),
    queryFn: () => locationsApi.list({ limit: 100, type: 'VILLE' }),
  });

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div>
      <PageHeader
        icon="site"
        title="Sites et quartiers"
        description={data ? `${data.meta.total} site(s)` : undefined}
      />

      <Panel>
        <div className="card overflow-hidden">
          <div className="flex flex-col gap-3 p-5 sm:flex-row">
            <input
              type="search"
              defaultValue={params.search ?? ''}
              onChange={(event) => update({ search: event.target.value })}
              placeholder="Nom ou code…"
              className="pill-outline h-11 flex-1 px-5 text-sm placeholder:text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />

            <select
              value={String(params.locationId ?? '')}
              onChange={(event) => update({ locationId: event.target.value })}
              className="pill-outline h-11 px-4 text-sm font-medium"
            >
              <option value="">Toutes les villes</option>
              {locations?.data.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>

          <DataTable
            columns={[
              {
                key: 'name',
                header: 'Site',
                render: (row) => <span className="font-semibold text-ink dark:text-white">{row.name}</span>,
              },
              { key: 'location', header: 'Ville', render: (row) => row.location.name },
              {
                key: 'code',
                header: 'Code',
                render: (row) => (
                  <span className="tabular rounded-pill bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink-soft dark:bg-white/10 dark:text-slate-300">
                    {row.code}
                  </span>
                ),
              },
              { key: 'properties', header: 'Terrains', align: 'right', render: (row) => row._count.properties },
              { key: 'projects', header: 'Projets', align: 'right', render: (row) => row._count.projects },
            ]}
            rows={data?.data ?? []}
            rowKey={(row) => row.id}
            loading={isLoading}
            empty={
              <EmptyState
                title="Aucun site"
                description="Les sites découpent une ville en quartiers."
                icon={<Icon name="site" className="h-8 w-8" />}
              />
            }
          />

          {data && <Pagination meta={data.meta} onPageChange={setPage} />}
        </div>
      </Panel>
    </div>
  );
}
