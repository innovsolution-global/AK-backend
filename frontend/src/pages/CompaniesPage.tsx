import { useQuery } from '@tanstack/react-query';
import { companiesApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { DataTable } from '@/components/data/DataTable';
import { Pagination } from '@/components/data/Pagination';
import { useListParams } from '@/hooks/useListParams';

export default function CompaniesPage() {
  const { params, update, setPage } = useListParams({ sort: 'name', order: 'asc' });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.companies.list(params),
    queryFn: () => companiesApi.list(params),
    placeholderData: (previous) => previous,
  });

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div>
      <PageHeader
        icon="company"
        title="Entreprises et gérants"
        description={data ? `${data.meta.total} entreprise(s)` : undefined}
      />

      <Panel>
        <div className="card overflow-hidden">
          <div className="p-5">
            <input
              type="search"
              defaultValue={params.search ?? ''}
              onChange={(event) => update({ search: event.target.value })}
              placeholder="Nom, numéro d'enregistrement, contact…"
              className="pill-outline h-11 w-full px-5 text-sm placeholder:text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:max-w-md"
            />
          </div>

          <DataTable
            columns={[
              {
                key: 'name',
                header: 'Entreprise',
                render: (row) => (
                  <div>
                    <p className="font-semibold text-ink dark:text-white">{row.name}</p>
                    {row.registrationNumber && <p className="text-xs text-ink-muted">{row.registrationNumber}</p>}
                  </div>
                ),
              },
              {
                key: 'contact',
                header: 'Contact',
                render: (row) => (
                  <div>
                    <p>{row.contactPerson ?? '—'}</p>
                    {row.phone && <p className="text-xs text-ink-muted">{row.phone}</p>}
                  </div>
                ),
              },
              {
                key: 'email',
                header: 'Email',
                render: (row) =>
                  row.email ? (
                    <a href={`mailto:${row.email}`} className="text-brand-600 hover:text-brand-700 dark:text-brand-400">
                      {row.email}
                    </a>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  ),
              },
              { key: 'projects', header: 'Projets', align: 'right', render: (row) => row._count.projects },
            ]}
            rows={data?.data ?? []}
            rowKey={(row) => row.id}
            loading={isLoading}
            empty={
              <EmptyState
                title="Aucune entreprise"
                description="Enregistrez les entreprises qui pilotent vos projets."
                icon={<Icon name="company" className="h-8 w-8" />}
              />
            }
          />

          {data && <Pagination meta={data.meta} onPageChange={setPage} />}
        </div>
      </Panel>
    </div>
  );
}
