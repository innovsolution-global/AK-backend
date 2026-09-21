import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { sharedApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Alert, ErrorState, Skeleton } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { PropertyMiniMap } from '@/features/map/PropertyMiniMap';
import {
  formatAreaWithUnit,
  formatCoordinate,
  formatDate,
  formatFileSize,
  humanizeEnum,
} from '@/utils/format';

/**
 * Fiche restreinte du bénéficiaire (§22).
 *
 * N'affiche que ce que le backend a explicitement autorisé : ni notes
 * internes, ni vendeur, ni gestionnaire, ni projets.
 */
export default function SharedPropertyPage() {
  const { id = '' } = useParams();
  const toast = useToast();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.shared.property(id),
    queryFn: () => sharedApi.property(id),
    enabled: id.length > 0,
  });

  const { data: documents } = useQuery({
    queryKey: queryKeys.shared.documents(id),
    queryFn: () => sharedApi.documents(id),
    enabled: id.length > 0 && (data?.share.allowDocuments ?? false),
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

  const primary = data.coordinates.find((point) => point.isPrimary);

  const download = async (documentId: string) => {
    try {
      const { url } = await sharedApi.downloadDocument(documentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      toast.error((caught as Error).message);
    }
  };

  const downloadGeo = async (fileId: string) => {
    try {
      const { url } = await sharedApi.downloadGeoFile(id, fileId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      toast.error((caught as Error).message);
    }
  };

  return (
    <div>
      <PageHeader
        icon="land"
        backTo={{ to: '/shared', label: 'Mes biens partagés' }}
        title={data.reference}
        description={data.name}
      />

      <Panel>
      <Alert tone="info">
        Votre accès à ce bien expire le{' '}
        <strong>{formatDate(data.share.expiresAt)}</strong>.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="card p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink dark:text-white">
              Informations
            </h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Référence" value={data.reference} />
              <Detail label="Nom" value={data.name} />
              <Detail label="Ville" value={data.location.name} />
              <Detail label="Site / quartier" value={data.site?.name} />
              <Detail
                label="Superficie"
                value={formatAreaWithUnit(data.area, data.areaUnit)}
              />
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Statut
                </dt>
                <dd className="mt-1">
                  <StatusBadge status={data.status} kind="property" />
                </dd>
              </div>
            </dl>

            {data.description && (
              <div className="mt-5 border-t border-slate-100 dark:border-white/5 pt-4">
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Description
                </dt>
                <dd className="mt-1 whitespace-pre-line text-sm text-ink-soft dark:text-slate-300">
                  {data.description}
                </dd>
              </div>
            )}
          </section>

          {data.share.allowCoordinates && data.coordinates.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-4 text-sm font-semibold text-ink dark:text-white">
                Coordonnées ({data.coordinates.length})
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-white/5 text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="pb-2 font-medium">Point</th>
                    <th className="pb-2 font-medium">Latitude</th>
                    <th className="pb-2 font-medium">Longitude</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                  {data.coordinates.map((point, index) => (
                    <tr key={index}>
                      <td className="py-2 text-ink-soft dark:text-slate-300">
                        {point.label ?? `Point ${index + 1}`}
                      </td>
                      <td className="tabular py-2 text-ink-soft dark:text-slate-300">
                        {formatCoordinate(point.latitude)}
                      </td>
                      <td className="tabular py-2 text-ink-soft dark:text-slate-300">
                        {formatCoordinate(point.longitude)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {data.share.allowDocuments && (
            <section className="card overflow-hidden">
              <div className="border-b border-slate-100 dark:border-white/5 px-5 py-3.5">
                <h2 className="text-sm font-semibold text-ink dark:text-white">
                  Documents ({data.documentCount})
                </h2>
              </div>

              {(documents ?? []).length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-ink-muted">
                  Aucun document ne vous a été communiqué.
                </p>
              ) : (
                <ul className="divide-y divide-slate-50 dark:divide-white/5">
                  {(documents ?? []).map((doc) => (
                    <li key={doc.id} className="flex items-center gap-4 px-5 py-3.5">
                      <Icon name="document" className="h-5 w-5 shrink-0 text-ink-muted" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink dark:text-white">
                          {doc.name}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {humanizeEnum(doc.type)} · {formatFileSize(doc.size)}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Icon name="download" className="h-4 w-4" />}
                        onClick={() => void download(doc.id)}
                      >
                        Télécharger
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <div className="space-y-5">
          {data.share.allowCoordinates && primary && (
            <section className="card overflow-hidden">
              <PropertyMiniMap
                latitude={Number(primary.latitude)}
                longitude={Number(primary.longitude)}
                label={data.reference}
                status={data.status}
              />
            </section>
          )}

          {data.share.allowGoogleEarth && (
            <section className="card p-5">
              <h2 className="mb-3 text-sm font-semibold text-ink dark:text-white">
                Cartographie
              </h2>

              <div className="space-y-2">
                {data.googleMapsUrl && (
                  <a
                    href={data.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
                  >
                    <Icon name="globe" className="h-4 w-4" />
                    Ouvrir dans Google Maps
                  </a>
                )}
                {data.googleEarthUrl && (
                  <a
                    href={data.googleEarthUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
                  >
                    <Icon name="globe" className="h-4 w-4" />
                    Ouvrir dans Google Earth
                  </a>
                )}

                {data.geoFiles.map((geo) => (
                  <button
                    key={geo.id}
                    type="button"
                    onClick={() => void downloadGeo(geo.id)}
                    className="flex w-full items-center gap-2 text-left text-sm text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
                  >
                    <Icon name="download" className="h-4 w-4" />
                    {geo.fileName} ({geo.format})
                  </button>
                ))}

                {!data.googleMapsUrl &&
                  !data.googleEarthUrl &&
                  data.geoFiles.length === 0 && (
                    <p className="text-sm text-ink-muted">
                      Aucun élément cartographique disponible.
                    </p>
                  )}
              </div>
            </section>
          )}
        </div>
      </div>
      </Panel>
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
