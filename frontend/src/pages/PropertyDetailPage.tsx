import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { propertiesApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiRow, KpiSlot, Panel, PillTabs } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/Modal';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import {
  formatAreaWithUnit,
  formatCoordinate,
  formatDate,
  formatDateTime,
  humanizeEnum,
} from '@/utils/format';
import { DocumentsPanel } from '@/features/documents/DocumentsPanel';
import { GeoFilesPanel } from '@/features/documents/GeoFilesPanel';
import { SharesPanel } from '@/features/shares/SharesPanel';
import { PropertyMiniMap } from '@/features/map/PropertyMiniMap';

const TABS = [
  { id: 'overview', label: 'Informations' },
  { id: 'documents', label: 'Documents' },
  { id: 'google-earth', label: 'Google Earth' },
  { id: 'shares', label: 'Partages', permission: 'property.share' },
  { id: 'history', label: 'Historique' },
] as const;

export default function PropertyDetailPage() {
  const { id = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const activeTab = searchParams.get('tab') ?? 'overview';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.properties.detail(id),
    queryFn: () => propertiesApi.detail(id),
    enabled: id.length > 0,
  });

  const remove = useMutation({
    mutationFn: () => propertiesApi.remove(id),
    onSuccess: () => {
      toast.success('Terrain supprimé.');
      void queryClient.invalidateQueries({ queryKey: queryKeys.properties.all });
      navigate('/properties');
    },
    onError: (caught: Error) => toast.error(caught.message),
  });

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const tabs = TABS.filter((tab) => !('permission' in tab) || can(tab.permission));

  return (
    <div>
      <PageHeader
        icon="land"
        backTo={{ to: '/properties', label: 'Terrains' }}
        title={data.reference}
        description={data.name}
        actions={
          <>
            {can('property.update') && (
              <Button
                variant="secondary"
                size="lg"
                icon={<Icon name="edit" className="h-5 w-5" />}
                onClick={() => navigate(`/properties/${id}/edit`)}
              >
                Modifier
              </Button>
            )}
            {can('property.delete') && (
              <Button
                variant="ghost"
                size="lg"
                icon={<Icon name="trash" className="h-5 w-5" />}
                onClick={() => setConfirmDelete(true)}
              >
                Supprimer
              </Button>
            )}
          </>
        }
      />

      <Panel>
        {/* Bandeau de synthèse : les trois faits qu'on cherche en ouvrant une fiche. */}
        <KpiRow>
          <KpiSlot>
            <div className="card flex items-center gap-5 p-5">
              <div className="icon-disc h-[76px] w-[76px]">
                <Icon name="site" className="h-8 w-8" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-medium text-ink-muted">Localisation</p>
                <p className="mt-0.5 truncate text-xl font-extrabold text-ink dark:text-white">{data.location.name}</p>
                <p className="truncate text-sm text-ink-muted">{data.site?.name ?? 'Sans site rattaché'}</p>
              </div>
            </div>
          </KpiSlot>
          <KpiSlot>
            <div className="card flex items-center gap-5 p-5">
              <div className="icon-disc h-[76px] w-[76px]">
                <Icon name="layers" className="h-8 w-8" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-medium text-ink-muted">Superficie</p>
                <p className="mt-0.5 text-[2.2rem] font-extrabold leading-none tracking-tight text-ink dark:text-white">
                  {formatAreaWithUnit(data.area, data.areaUnit)}
                </p>
              </div>
            </div>
          </KpiSlot>
          <KpiSlot>
            <div className="card flex items-center gap-5 p-5">
              <div className="icon-disc h-[76px] w-[76px]">
                <Icon name="sparkles" className="h-8 w-8" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-medium text-ink-muted">Statut</p>
                <div className="mt-2">
                  <StatusBadge status={data.status} kind="property" className="px-3.5 py-1.5 text-sm" />
                </div>
                <p className="mt-1.5 text-sm text-ink-muted">
                  {data._count.documents} doc · {data._count.geoFiles} geo · {data._count.projects} projet(s)
                </p>
              </div>
            </div>
          </KpiSlot>
        </KpiRow>

        <PillTabs
          tabs={tabs.map((tab) => ({
            id: tab.id,
            label: tab.label,
            count:
              tab.id === 'documents'
                ? data._count.documents
                : tab.id === 'google-earth'
                  ? data._count.geoFiles
                  : undefined,
          }))}
          value={activeTab as (typeof tabs)[number]['id']}
          onChange={(tab) => setSearchParams({ tab }, { replace: true })}
        />

        {activeTab === 'overview' && <OverviewTab property={data} />}
        {activeTab === 'documents' && <DocumentsPanel propertyId={id} />}
        {activeTab === 'google-earth' && <GeoFilesPanel propertyId={id} />}
        {activeTab === 'shares' && can('property.share') && (
          <SharesPanel propertyId={id} propertyReference={data.reference} />
        )}
        {activeTab === 'history' && <HistoryTab propertyId={id} />}
      </Panel>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        destructive
        title="Supprimer ce terrain ?"
        description={`Le terrain ${data.reference} sera retiré des listes. Les partages en cours seront révoqués immédiatement. La fiche reste consultable dans le journal d'audit.`}
        confirmLabel="Supprimer"
      />
    </div>
  );
}

function OverviewTab({
  property,
}: {
  property: Awaited<ReturnType<typeof propertiesApi.detail>>;
}) {
  const primary = property.coordinates.find((point) => point.isPrimary);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink dark:text-white">
            Informations générales
          </h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Référence" value={property.reference} />
            <Detail label="Nom" value={property.name} />
            <Detail label="Ville" value={property.location.name} />
            <Detail label="Site / quartier" value={property.site?.name} />
            <Detail
              label="Superficie"
              value={formatAreaWithUnit(property.area, property.areaUnit)}
            />
            <Detail label="Statut" value={humanizeEnum(property.status)} />
            <Detail
              label="Date d'acquisition"
              value={formatDate(property.purchaseDate)}
            />
            <Detail
              label="Sessionnaire / vendeur"
              value={property.sellerName}
            />
            <Detail label="Contact vendeur" value={property.sellerContact} />
            <Detail
              label="Gestionnaire(s)"
              value={
                property.managers.length > 0
                  ? property.managers
                      .map((m) => `${m.user.firstName} ${m.user.lastName}`)
                      .join(', ')
                  : undefined
              }
            />
          </dl>

          {property.description && (
            <div className="mt-5 border-t border-slate-100 dark:border-white/5 pt-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                Description
              </dt>
              <dd className="mt-1 whitespace-pre-line text-sm text-ink-soft dark:text-slate-300">
                {property.description}
              </dd>
            </div>
          )}

          {property.notes && (
            <div className="mt-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">
                Notes internes
              </dt>
              <dd className="mt-1 whitespace-pre-line text-sm text-amber-800 dark:text-amber-300">
                {property.notes}
              </dd>
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink dark:text-white">
            Coordonnées ({property.coordinates.length})
          </h2>

          {property.coordinates.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Aucune coordonnée enregistrée. Ce terrain n'apparaît pas sur la carte.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-white/5 text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="pb-2 font-medium">Point</th>
                    <th className="pb-2 font-medium">Latitude</th>
                    <th className="pb-2 font-medium">Longitude</th>
                    <th className="pb-2 text-right font-medium">Altitude</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                  {property.coordinates.map((point, index) => (
                    <tr key={point.id ?? index}>
                      <td className="py-2 text-ink-soft dark:text-slate-300">
                        {point.label ?? `Point ${index + 1}`}
                        {point.isPrimary && (
                          <span className="ml-2 rounded bg-brand-50 dark:bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-700 dark:text-brand-300">
                            principal
                          </span>
                        )}
                      </td>
                      <td className="tabular py-2 text-ink-soft dark:text-slate-300">
                        {formatCoordinate(point.latitude)}
                      </td>
                      <td className="tabular py-2 text-ink-soft dark:text-slate-300">
                        {formatCoordinate(point.longitude)}
                      </td>
                      <td className="tabular py-2 text-right text-ink-soft dark:text-slate-300">
                        {point.altitude ? `${point.altitude} m` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="space-y-5">
        {primary && (
          <section className="card overflow-hidden">
            <PropertyMiniMap
              latitude={Number(primary.latitude)}
              longitude={Number(primary.longitude)}
              label={property.reference}
              status={property.status}
            />
          </section>
        )}

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink dark:text-white">Liens externes</h2>
          <div className="space-y-2">
            {property.googleMapsUrl ? (
              <ExternalLink href={property.googleMapsUrl} label="Ouvrir dans Google Maps" />
            ) : (
              <p className="text-sm text-ink-muted">Aucun lien Google Maps</p>
            )}
            {property.googleEarthUrl ? (
              <ExternalLink
                href={property.googleEarthUrl}
                label="Ouvrir dans Google Earth"
              />
            ) : (
              <p className="text-sm text-ink-muted">Aucun lien Google Earth</p>
            )}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink dark:text-white">Traçabilité</h2>
          <dl className="space-y-2.5 text-sm">
            <Detail
              label="Créé par"
              value={
                property.createdBy
                  ? `${property.createdBy.firstName} ${property.createdBy.lastName}`
                  : undefined
              }
            />
            <Detail label="Créé le" value={formatDateTime(property.createdAt)} />
            <Detail
              label="Projets liés"
              value={String(property._count.projects)}
            />
          </dl>
        </section>
      </div>
    </div>
  );
}

function HistoryTab({ propertyId }: { propertyId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.properties.history(propertyId),
    queryFn: () => propertiesApi.history(propertyId),
  });

  if (isLoading) return <Skeleton className="h-48" />;

  const entries = data ?? [];

  return (
    <div className="card divide-y divide-slate-50 dark:divide-white/5">
      {entries.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-ink-muted">
          Aucune action enregistrée.
        </p>
      ) : (
        entries.map((entry) => (
          <div key={entry.id} className="flex items-start gap-4 px-5 py-3.5">
            <span className="mt-0.5 rounded bg-slate-100 dark:bg-white/10 px-2 py-0.5 text-xs font-medium text-ink-soft dark:text-slate-300">
              {humanizeEnum(entry.action)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-soft dark:text-slate-300">
                {entry.user
                  ? `${entry.user.firstName} ${entry.user.lastName}`
                  : 'Système'}{' '}
                <span className="text-ink-muted">· {entry.entity}</span>
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {formatDateTime(entry.createdAt)}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-ink dark:text-white">{value || '—'}</dd>
    </div>
  );
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      // `noopener` empêche la page ouverte d'accéder à `window.opener`.
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-sm text-brand-600 dark:text-brand-400 transition-colors hover:text-brand-700 dark:hover:text-brand-300"
    >
      <Icon name="globe" className="h-4 w-4" />
      {label}
    </a>
  );
}

export { Detail };
