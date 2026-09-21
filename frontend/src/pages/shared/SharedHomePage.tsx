import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { sharedApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { formatDate } from '@/utils/format';

export default function SharedHomePage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.shared.properties(),
    queryFn: sharedApi.properties,
  });

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-28" />
      </div>
    );
  }

  const properties = data ?? [];

  return (
    <div>
      <PageHeader
        icon="share"
        title={properties.length > 1 ? 'Biens partagés avec vous' : 'Bien partagé avec vous'}
        description="Vous accédez uniquement aux biens listés ci-dessous."
      />

      <Panel className="space-y-3">
        {properties.length === 0 ? (
          <div className="card">
            <EmptyState
              title="Aucun bien accessible"
              description="Votre accès a peut-être expiré ou été révoqué. Rapprochez-vous de la personne qui vous l'a accordé."
              icon={<Icon name="land" className="h-10 w-10" />}
            />
          </div>
        ) : (
          properties.map((property) => (
            <Link
              key={property.id}
              to={`/shared/properties/${property.id}`}
              className="card flex items-center gap-4 p-5 transition-colors hover:border-brand-300 hover:bg-brand-50/30"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-500/10">
                <Icon name="land" className="h-5 w-5 text-brand-600 dark:text-brand-400" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-ink dark:text-white">{property.reference}</p>
                  <StatusBadge status={property.status} kind="property" />
                </div>
                <p className="mt-0.5 truncate text-sm text-ink-soft dark:text-slate-300">
                  {property.name}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {property.location.name}
                  {property.site && ` · ${property.site.name}`} · accès jusqu'au{' '}
                  {formatDate(property.expiresAt)}
                </p>
              </div>

              <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-ink-muted" />
            </Link>
          ))
        )}
      </Panel>
    </div>
  );
}
