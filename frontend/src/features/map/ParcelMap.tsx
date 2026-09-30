import { useEffect, useMemo } from 'react';
import {
  CircleMarker,
  GeoJSON as GeoJsonLayer,
  MapContainer,
  Marker,
  Polygon,
  Tooltip,
  useMap,
} from 'react-leaflet';
import { circleMarker, type PathOptions } from 'leaflet';
import type { Feature, FeatureCollection, GeoJsonObject } from 'geojson';
import { BasemapLayer, BasemapSwitch, useBasemap } from './BasemapSwitch';
import { statusMarkerIcon } from './markerIcon';
import {
  PARCEL_COLOR,
  PARCEL_HALO,
  parcelRing,
  primaryPoint,
  toParcelPoints,
  type ParcelPoint,
} from './parcel';
import type { Coordinate, PropertyStatus } from '@/types/domain';
import { formatArea, formatCoordinate } from '@/utils/format';

interface ParcelMapProps {
  coordinates: Coordinate[];
  status: PropertyStatus;
  label: string;
  /** Géométries GeoJSON de fichiers importés, superposées à l'emprise saisie. */
  geometries?: unknown[];
  areaSqm?: number;
  height?: number;
  interactive?: boolean;
  /** Masque le pied de carte (coordonnées du repère). */
  compact?: boolean;
}

/**
 * Carte d'un terrain : emprise cyan sur imagerie satellite (§11, §12).
 *
 * C'est la même lecture que dans Google Earth — le contour de la parcelle
 * par rapport au bâti et à la végétation visibles — pour que ce qui est
 * partagé au bénéficiaire corresponde à ce que voit le gestionnaire.
 */
export function ParcelMap({
  coordinates,
  status,
  label,
  geometries = [],
  areaSqm,
  height = 320,
  interactive = true,
  compact = false,
}: ParcelMapProps) {
  const { basemap, select } = useBasemap('satellite');

  const points = useMemo(() => toParcelPoints(coordinates), [coordinates]);
  const ring = useMemo(() => parcelRing(points), [points]);
  const primary = primaryPoint(points);

  const importedFeatures = useMemo(
    () => geometries.filter((geometry): geometry is GeoJsonObject => isGeoJson(geometry)),
    [geometries],
  );

  if (!primary && importedFeatures.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-ink-muted"
        style={{ height }}
      >
        Aucune coordonnée à afficher.
      </div>
    );
  }

  const center: [number, number] = primary ? [primary.lat, primary.lng] : [9.6412, -13.5784];

  return (
    <div>
      <div className="relative">
        <MapContainer
          center={center}
          zoom={16}
          style={{ height }}
          scrollWheelZoom={interactive}
          dragging={interactive}
          doubleClickZoom={interactive}
          zoomControl={interactive}
          attributionControl={false}
        >
          <BasemapLayer basemap={basemap} />
          <FitToParcel ring={ring} primary={primary} imported={importedFeatures} />

          {importedFeatures.map((feature, index) => (
            <GeoJsonLayer
              // Les géométries importées ne changent pas d'identité : l'index
              // suffit et évite un re-rendu complet de la couche.
              key={`import-${index}`}
              data={feature}
              style={IMPORTED_STYLE}
              pointToLayer={(_, latlng) =>
                circleMarker(latlng, {
                  radius: 5,
                  color: '#f59e0b',
                  weight: 2,
                  fillColor: '#fff',
                  fillOpacity: 1,
                })
              }
            />
          ))}

          {ring.length >= 3 && (
            <>
              {/* Halo sombre sous le trait : lisible sur sable clair comme sur toit blanc. */}
              <Polygon
                positions={ring.map((point) => [point.lat, point.lng] as [number, number])}
                pathOptions={{ color: PARCEL_HALO, weight: 7, opacity: 0.55, fill: false }}
                interactive={false}
              />
              <Polygon
                positions={ring.map((point) => [point.lat, point.lng] as [number, number])}
                pathOptions={{
                  color: PARCEL_COLOR,
                  weight: 3,
                  opacity: 1,
                  fillColor: PARCEL_COLOR,
                  fillOpacity: 0.16,
                }}
              >
                <Tooltip sticky direction="top" className="parcel-label">
                  {label}
                  {areaSqm ? ` · ${formatArea(areaSqm)}` : ''}
                </Tooltip>
              </Polygon>

              {ring.map((point, index) => (
                <CircleMarker
                  key={`${point.lat}-${point.lng}-${index}`}
                  center={[point.lat, point.lng]}
                  radius={5}
                  pathOptions={{ color: PARCEL_HALO, weight: 2, fillColor: '#ffffff', fillOpacity: 1 }}
                >
                  <Tooltip direction="top" offset={[0, -6]} className="parcel-label">
                    {point.label ?? `Borne ${index + 1}`}
                  </Tooltip>
                </CircleMarker>
              ))}
            </>
          )}

          {primary && (
            <Marker position={[primary.lat, primary.lng]} icon={statusMarkerIcon(status)}>
              <Tooltip direction="top" offset={[0, -34]} className="parcel-label">
                {primary.label ?? label}
              </Tooltip>
            </Marker>
          )}
        </MapContainer>

        <BasemapSwitch
          value={basemap}
          onChange={select}
          className="absolute right-3 top-3 z-[1000]"
        />
      </div>

      {!compact && primary && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 dark:border-white/5">
          <div>
            <p className="text-xs font-medium text-ink-soft dark:text-slate-300">{label}</p>
            <p className="tabular mt-0.5 text-xs text-ink-muted">
              {formatCoordinate(primary.lat)}, {formatCoordinate(primary.lng)}
            </p>
          </div>
          <p className="text-xs text-ink-muted">
            {ring.length >= 3
              ? `Emprise · ${ring.length} bornes`
              : 'Repère seul — ajoutez des bornes pour dessiner l’emprise'}
          </p>
        </div>
      )}
    </div>
  );
}

const IMPORTED_STYLE: PathOptions = {
  color: '#f59e0b',
  weight: 2.5,
  dashArray: '6 4',
  fillColor: '#f59e0b',
  fillOpacity: 0.08,
};

function isGeoJson(value: unknown): value is GeoJsonObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

/** Cadre la carte sur l'emprise, sinon sur le repère, sinon sur les imports. */
function FitToParcel({
  ring,
  primary,
  imported,
}: {
  ring: ParcelPoint[];
  primary: ParcelPoint | null;
  imported: GeoJsonObject[];
}) {
  const map = useMap();

  useEffect(() => {
    if (ring.length >= 3) {
      map.fitBounds(
        ring.map((point) => [point.lat, point.lng] as [number, number]),
        { padding: [36, 36], maxZoom: 19 },
      );
      return;
    }

    if (primary) {
      map.setView([primary.lat, primary.lng], 17);
      return;
    }

    const bounds = boundsOfGeoJson(imported);
    if (bounds) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 18 });
  }, [map, ring, primary, imported]);

  return null;
}

function boundsOfGeoJson(objects: GeoJsonObject[]): Array<[number, number]> | null {
  const positions: Array<[number, number]> = [];

  const visit = (coords: unknown) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      positions.push([coords[1], coords[0]]);
      return;
    }
    for (const child of coords) visit(child);
  };

  for (const object of objects) {
    if (object.type === 'FeatureCollection') {
      for (const feature of (object as FeatureCollection).features) {
        visit(feature.geometry && 'coordinates' in feature.geometry ? feature.geometry.coordinates : null);
      }
    } else if (object.type === 'Feature') {
      const geometry = (object as Feature).geometry;
      visit(geometry && 'coordinates' in geometry ? geometry.coordinates : null);
    } else if ('coordinates' in object) {
      visit((object as { coordinates: unknown }).coordinates);
    }
  }

  return positions.length > 0 ? positions : null;
}
