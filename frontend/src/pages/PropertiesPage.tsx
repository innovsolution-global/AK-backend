import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi, locationsApi, propertiesApi } from '@/api/endpoints';
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
import { formatArea, formatDate, formatNumber, humanizeEnum } from '@/utils/format';
import { PROPERTY_STATUSES, type PropertyListItem } from '@/types/domain';

export default function PropertiesPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { params, update, setPage, toggleSort, reset, hasFilters } = useListParams({
    sort: 'createdAt',
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.properties.list(params),
    queryFn: () => propertiesApi.list(params),
    placeholderData: (previous) => previous,
  });

  const { data: locations } = useQuery({
    queryKey: queryKeys.locations.list({ limit: 100 }),
    queryFn: () => locationsApi.list({ limit: 100, type: 'VILLE' }),
  });

  // Les indicateurs de tête portent sur tout le périmètre, pas sur la page
  // filtrée : ils donnent le contexte dans lequel on filtre.
  const overview = useQuery({
    queryKey: queryKeys.dashboard.overview(),
    queryFn: dashboardApi.overview,
    enabled: can('dashboard.read'),
    staleTime: 60_000,
  });

  const developed =
    overview.data?.properties.byStatus.find((row) => row.key === 'AMENAGE')?.count ?? 0;
  const inProject =
    overview.data?.properties.byStatus.find((row) => row.key === 'EN_PROJET')?.count ?? 0;

  const columns: Array<Column<PropertyListItem>> = [
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
      key: 'areaSqm',
      header: 'Superficie',
      sortable: true,
      align: 'right',
      render: (row) => (
        <span className="font-semibold text-ink dark:text-white">{formatArea(row.areaSqm)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      sortable: true,
      render: (row) => <StatusBadge status={row.status} kind="property" />,
    },
    {
      key: 'managers',
      header: 'Gestionnaire',
      render: (row) =>
        row.managers.length > 0 ? (
          <span>
            {row.managers[0]?.user.firstName} {row.managers[0]?.user.lastName}
            {row.managers.length > 1 && (
              <span className="text-ink-muted"> +{row.managers.length - 1}</span>
            )}
          </span>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
    {
      key: 'documents',
      header: 'Pièces',
      align: 'center',
      render: (row) => (
        <span className="rounded-pill bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink-soft dark:bg-white/10 dark:text-slate-300">
          {row._count.documents} doc · {row._count.geoFiles} geo
        </span>
      ),
    },
    {
      key: 'purchaseDate',
      header: 'Acquisition',
      sortable: true,
      align: 'right',
      render: (row) => formatDate(row.purchaseDate),
    },
  ];

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div>
      <PageHeader
        icon="land"
        title="Terrains & domaines"
        description={data ? `${data.meta.total} bien(s) dans votre périmètre` : undefined}
        actions={
          can('property.create') && (
            <Button
              size="lg"
              icon={<Icon name="plus" className="h-5 w-5" />}
              onClick={() => navigate('/properties/create')}
            >
              Nouveau terrain
            </Button>
          )
        }
      />

      <Panel>
        {overview.data && (
          <KpiRow>
            <KpiSlot>
              <KpiCard
                icon="land"
                label="Terrains"
                value={overview.data.properties.total}
                hint={`${overview.data.geography.locations} villes · ${overview.data.geography.sites} sites`}
              />
            </KpiSlot>
            <KpiSlot>
              <KpiCard
                icon="layers"
                label="Superficie"
                value={overview.data.properties.totalAreaHectares}
                unit="ha"
                decimals={overview.data.properties.totalAreaHectares >= 100 ? 0 : 1}
                hint={`${formatNumber(overview.data.properties.totalAreaSqm, 0)} m²`}
              />
            </KpiSlot>
            <KpiSlot>
              <KpiCard
                icon="sparkles"
                label="Aménagés"
                value={developed}
                delta={inProject > 0 ? { value: `${inProject} en projet`, good: true } : undefined}
                hint={inProject === 0 ? 'Aucun terrain en projet' : undefined}
                onClick={() => update({ status: 'AMENAGE' })}
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
              placeholder="Référence, nom, vendeur…"
              className="pill-outline h-11 flex-1 px-5 text-sm placeholder:text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />

            <select
              value={String(params.status ?? '')}
              onChange={(event) => update({ status: event.target.value })}
              className="pill-outline h-11 px-4 text-sm font-medium"
            >
              <option value="">Tous les statuts</option>
              {PROPERTY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {humanizeEnum(status)}
                </option>
              ))}
            </select>

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
            onRowClick={(row) => navigate(`/properties/${row.id}`)}
            empty={
              <EmptyState
                title={hasFilters ? 'Aucun terrain ne correspond' : 'Aucun terrain'}
                description={
                  hasFilters
                    ? 'Ajustez vos filtres pour élargir la recherche.'
                    : 'Créez votre premier terrain pour commencer.'
                }
                icon={<Icon name="land" className="h-8 w-8" />}
                action={
                  hasFilters ? (
                    <Button variant="secondary" onClick={reset}>
                      Réinitialiser les filtres
                    </Button>
                  ) : (
                    can('property.create') && (
                      <Button onClick={() => navigate('/properties/create')}>Créer un terrain</Button>
                    )
                  )
                }
              />
            }
          />

          {data && (
            <Pagination
              meta={data.meta}
              onPageChange={setPage}
              onLimitChange={(limit) => update({ limit })}
            />
          )}
        </div>
      </Panel>
    </div>
  );
}
