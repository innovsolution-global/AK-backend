import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { locationsApi, mapsApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { useListParams } from '@/hooks/useListParams';
import { formatArea, humanizeEnum } from '@/utils/format';
import { statusMarkerIcon } from '@/features/map/markerIcon';
import { PROPERTY_STATUSES, type MapMarker } from '@/types/domain';

/** Cadrage par défaut : Conakry, lorsqu'aucun terrain n'a de coordonnées. */
const FALLBACK_CENTER: [number, number] = [9.6412, -13.5784];
const FALLBACK_ZOOM = 11;

export default function MapPage() {
  const { params, update, reset, hasFilters } = useListParams();

  const filters = useMemo(
    () => ({
      status: params.status,
      locationId: params.locationId,
      search: params.search,
    }),
    [params.status, params.locationId, params.search],
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.map.markers(filters),
    queryFn: () => mapsApi.markers(filters),
  });

  const { data: locations } = useQuery({
    queryKey: queryKeys.locations.list({ type: 'VILLE' }),
    queryFn: () => locationsApi.list({ limit: 100, type: 'VILLE' }),
  });

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const markers = data ?? [];

  return (
    <div>
      <PageHeader
        icon="map"
        title="Carte du patrimoine"
        description={
          isLoading
            ? undefined
            : `${markers.length} terrain(s) localisé(s)`
        }
        actions={
          hasFilters && (
            <Button variant="secondary" size="sm" onClick={reset}>
              Réinitialiser
            </Button>
          )
        }
      />

      <Panel>
      <div className="card flex flex-col gap-3 p-5 sm:flex-row">
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
      </div>

      {isLoading ? (
        <Skeleton className="h-[60vh] rounded-card" />
      ) : (
        <div className="card overflow-hidden p-2">
          <MapContainer
            center={FALLBACK_CENTER}
            zoom={FALLBACK_ZOOM}
            style={{ height: '60vh', minHeight: 420 }}
            scrollWheelZoom
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />

            <FitToMarkers markers={markers} />

            {markers.map((marker) => (
              <Marker
                key={marker.id}
                position={[marker.latitude, marker.longitude]}
                icon={statusMarkerIcon(marker.status)}
              >
                <Popup>
                  <div className="min-w-56 p-3">
                    <p className="text-sm font-semibold text-ink dark:text-white">
                      {marker.reference}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft dark:text-slate-300">{marker.name}</p>

                    <dl className="mt-2.5 space-y-1 text-xs">
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-muted">Localisation</dt>
                        <dd className="text-right text-ink dark:text-white">
                          {marker.locationName}
                          {marker.siteName && ` · ${marker.siteName}`}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-muted">Superficie</dt>
                        <dd className="text-ink dark:text-white">{formatArea(marker.areaSqm)}</dd>
                      </div>
                    </dl>

                    <div className="mt-2.5">
                      <StatusBadge status={marker.status} kind="property" />
                    </div>

                    <Link
                      to={`/properties/${marker.id}`}
                      className="mt-3 block rounded-2xl bg-gradient-brand px-3 py-2 text-center text-xs font-semibold text-white shadow-glow-brand"
                    >
                      Ouvrir la fiche
                    </Link>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {markers.length === 0 && (
            <p className="border-t border-slate-100 dark:border-white/5 px-5 py-4 text-center text-sm text-ink-muted">
              Aucun terrain localisé pour ces critères. Ajoutez des coordonnées
              depuis la fiche d'un bien pour le voir apparaître ici.
            </p>
          )}
        </div>
      )}

      <div className="card flex flex-wrap items-center gap-2 p-4">
        <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Légende</span>
        {PROPERTY_STATUSES.map((status) => (
          <StatusBadge key={status} status={status} kind="property" />
        ))}
      </div>
      </Panel>
    </div>
  );
}

/**
 * Ajuste le cadrage sur l'ensemble des markers.
 *
 * Composant enfant plutôt qu'effet du parent : `useMap` n'est disponible qu'à
 * l'intérieur du `MapContainer`.
 */
function FitToMarkers({ markers }: { markers: MapMarker[] }) {
  const map = useMap();

  useMemo(() => {
    if (markers.length === 0) return;

    if (markers.length === 1) {
      const only = markers[0];
      if (only) map.setView([only.latitude, only.longitude], 15);
      return;
    }

    const bounds: Array<[number, number]> = markers.map((marker) => [
      marker.latitude,
      marker.longitude,
    ]);

    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
  }, [markers, map]);

  return null;
}
