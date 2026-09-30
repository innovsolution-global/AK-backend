import { Link } from 'react-router-dom';
import { Polygon, Popup, Tooltip } from 'react-leaflet';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatArea } from '@/utils/format';
import { PARCEL_COLOR, PARCEL_HALO, geoJsonRingToLatLngs } from './parcel';
import type { ParcelFeature } from '@/types/domain';

interface ParcelsLayerProps {
  features: ParcelFeature[];
  /** Sans lien vers la fiche (espace bénéficiaire, aperçus). */
  linkToProperty?: boolean;
}

/**
 * Couche des emprises sur la carte du patrimoine.
 *
 * Complète les markers : un terrain borné se voit comme une surface, pas
 * seulement comme une épingle. Le trait cyan, doublé d'un halo sombre, reste
 * lisible sur l'imagerie satellite comme sur le plan.
 */
export function ParcelsLayer({ features, linkToProperty = true }: ParcelsLayerProps) {
  return (
    <>
      {features.map((feature) => {
        const ring = feature.geometry.coordinates[0];
        if (!ring || ring.length < 4) return null;

        const positions = geoJsonRingToLatLngs(ring);
        const { properties } = feature;

        return (
          <Polygon
            key={feature.id}
            positions={positions}
            pathOptions={{
              color: PARCEL_COLOR,
              weight: 2.5,
              opacity: 1,
              fillColor: PARCEL_COLOR,
              fillOpacity: 0.14,
            }}
            eventHandlers={{
              mouseover: (event) => event.target.setStyle({ weight: 4, fillOpacity: 0.26 }),
              mouseout: (event) => event.target.setStyle({ weight: 2.5, fillOpacity: 0.14 }),
            }}
          >
            <Tooltip sticky direction="top" className="parcel-label">
              {properties.reference} · {formatArea(properties.areaSqm)}
            </Tooltip>

            <Popup>
              <div className="min-w-56 p-3">
                <p className="text-sm font-semibold text-ink dark:text-white">
                  {properties.reference}
                </p>
                <p className="mt-0.5 text-xs text-ink-soft dark:text-slate-300">{properties.name}</p>

                <dl className="mt-2.5 space-y-1 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Localisation</dt>
                    <dd className="text-right text-ink dark:text-white">
                      {properties.locationName}
                      {properties.siteName && ` · ${properties.siteName}`}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Superficie (titre)</dt>
                    <dd className="text-ink dark:text-white">{formatArea(properties.areaSqm)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Emprise mesurée</dt>
                    <dd className="text-ink dark:text-white">
                      {formatArea(properties.measuredAreaSqm)} · {properties.vertexCount} bornes
                    </dd>
                  </div>
                </dl>

                <div className="mt-2.5">
                  <StatusBadge status={properties.status} kind="property" />
                </div>

                {linkToProperty && (
                  <Link
                    to={`/properties/${properties.id}`}
                    className="mt-3 block rounded-2xl bg-gradient-brand px-3 py-2 text-center text-xs font-semibold text-white shadow-glow-brand"
                  >
                    Ouvrir la fiche
                  </Link>
                )}
              </div>
            </Popup>
          </Polygon>
        );
      })}
    </>
  );
}

/** Halo sombre à poser sous `ParcelsLayer` pour le contraste sur sol clair. */
export function ParcelsHalo({ features }: { features: ParcelFeature[] }) {
  return (
    <>
      {features.map((feature) => {
        const ring = feature.geometry.coordinates[0];
        if (!ring || ring.length < 4) return null;
        return (
          <Polygon
            key={`halo-${feature.id}`}
            positions={geoJsonRingToLatLngs(ring)}
            pathOptions={{ color: PARCEL_HALO, weight: 6, opacity: 0.5, fill: false }}
            interactive={false}
          />
        );
      })}
    </>
  );
}
