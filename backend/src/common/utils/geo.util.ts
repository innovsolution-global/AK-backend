/**
 * Géométrie plane suffisante pour des parcelles (§11, §12).
 *
 * Une emprise foncière fait quelques hectares au plus : la projection
 * équirectangulaire locale (mètres autour du centroïde) donne une erreur
 * inférieure au centimètre, bien en dessous de la précision des relevés.
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  label?: string | null;
}

/** Mètres par degré de latitude (WGS 84, valeur moyenne). */
const METERS_PER_DEGREE = 111_320;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Retire le point de fermeture d'un anneau (dernier == premier). */
export function openRing<T extends GeoPoint>(ring: T[]): T[] {
  if (ring.length < 2) return ring;

  const first = ring[0];
  const last = ring[ring.length - 1];

  return first.latitude === last.latitude && first.longitude === last.longitude
    ? ring.slice(0, -1)
    : ring;
}

/**
 * Centroïde d'un polygone (formule du lacet). Tombe sur la moyenne des points
 * quand l'aire est nulle — points alignés ou anneau dégénéré.
 */
export function ringCentroid(points: GeoPoint[]): {
  latitude: number;
  longitude: number;
} {
  const ring = openRing(points);

  if (ring.length === 0) return { latitude: 0, longitude: 0 };
  if (ring.length < 3) return meanPoint(ring);

  let doubleArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const cross = a.longitude * b.latitude - b.longitude * a.latitude;

    doubleArea += cross;
    cx += (a.longitude + b.longitude) * cross;
    cy += (a.latitude + b.latitude) * cross;
  }

  if (Math.abs(doubleArea) < 1e-12) return meanPoint(ring);

  const factor = 1 / (3 * doubleArea);
  return { longitude: cx * factor, latitude: cy * factor };
}

function meanPoint(points: GeoPoint[]): { latitude: number; longitude: number } {
  const sum = points.reduce(
    (acc, point) => ({
      latitude: acc.latitude + point.latitude,
      longitude: acc.longitude + point.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );

  return {
    latitude: sum.latitude / points.length,
    longitude: sum.longitude / points.length,
  };
}

/** Superficie d'un anneau en m², projection locale autour du centroïde. */
export function ringAreaSqm(points: GeoPoint[]): number {
  const ring = openRing(points);
  if (ring.length < 3) return 0;

  const center = meanPoint(ring);
  const metersPerLongitudeDegree =
    METERS_PER_DEGREE * Math.cos(toRadians(center.latitude));

  const projected = ring.map((point) => ({
    x: (point.longitude - center.longitude) * metersPerLongitudeDegree,
    y: (point.latitude - center.latitude) * METERS_PER_DEGREE,
  }));

  let doubleArea = 0;
  for (let i = 0; i < projected.length; i += 1) {
    const a = projected[i];
    const b = projected[(i + 1) % projected.length];
    doubleArea += a.x * b.y - b.x * a.y;
  }

  return Math.round(Math.abs(doubleArea) / 2);
}

/**
 * Anneau d'emprise d'un terrain à partir de ses coordonnées saisies.
 *
 * Convention partagée avec le frontend : le point principal est le repère de
 * la carte générale (souvent le centre) et ne fait pas partie du contour ;
 * les autres points, dans l'ordre de saisie, forment l'emprise. Si l'usager
 * n'a saisi que des sommets — l'un d'eux étant marqué principal — on garde
 * tous les points plutôt que d'amputer un coin.
 */
export function parcelRing<T extends GeoPoint & { isPrimary?: boolean }>(
  points: T[],
): T[] {
  const vertices = points.filter((point) => !point.isPrimary);
  if (vertices.length >= 3) return vertices;
  if (points.length >= 3) return points;
  return [];
}

export interface GeoBoundsBox {
  minLatitude: number;
  minLongitude: number;
  maxLatitude: number;
  maxLongitude: number;
}

export function boundsOf(points: GeoPoint[]): GeoBoundsBox | null {
  if (points.length === 0) return null;

  return points.reduce<GeoBoundsBox>(
    (box, point) => ({
      minLatitude: Math.min(box.minLatitude, point.latitude),
      minLongitude: Math.min(box.minLongitude, point.longitude),
      maxLatitude: Math.max(box.maxLatitude, point.latitude),
      maxLongitude: Math.max(box.maxLongitude, point.longitude),
    }),
    {
      minLatitude: points[0].latitude,
      minLongitude: points[0].longitude,
      maxLatitude: points[0].latitude,
      maxLongitude: points[0].longitude,
    },
  );
}

/**
 * Quadrilatère d'une superficie donnée autour d'un point, légèrement
 * irrégulier pour ressembler à un relevé réel plutôt qu'à un carré parfait.
 * Utilisé par le seed de démonstration.
 */
export function parcelAround(
  latitude: number,
  longitude: number,
  areaSqm: number,
  seed = 0,
): GeoPoint[] {
  const side = Math.sqrt(areaSqm);
  const metersPerLongitudeDegree = METERS_PER_DEGREE * Math.cos(toRadians(latitude));

  // Déformation déterministe (pas d'aléa : le seed doit être reproductible).
  const jitter = (index: number) => 0.85 + ((seed * 7 + index * 13) % 10) / 33;
  const rotation = toRadians(((seed * 37) % 60) - 30);

  const corners = [
    { x: -side / 2, y: -side / 2 },
    { x: side / 2, y: -side / 2 },
    { x: side / 2, y: side / 2 },
    { x: -side / 2, y: side / 2 },
  ].map((corner, index) => {
    const scaled = { x: corner.x * jitter(index), y: corner.y * jitter(index + 4) };
    return {
      x: scaled.x * Math.cos(rotation) - scaled.y * Math.sin(rotation),
      y: scaled.x * Math.sin(rotation) + scaled.y * Math.cos(rotation),
    };
  });

  return corners.map((corner, index) => ({
    label: `Borne ${index + 1}`,
    latitude: round7(latitude + corner.y / METERS_PER_DEGREE),
    longitude: round7(longitude + corner.x / metersPerLongitudeDegree),
  }));
}

function round7(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}

// --- GeoJSON -----------------------------------------------------------------

interface GeoJsonFeature {
  properties?: { name?: string; description?: string } | null;
  geometry?: { type: string; coordinates: unknown } | null;
}

interface GeoJsonCollection {
  type?: string;
  features?: GeoJsonFeature[];
}

export interface ExtractedRing {
  name: string | null;
  points: GeoPoint[];
}

/**
 * Emprise d'une FeatureCollection : anneau extérieur ouvert du premier
 * polygone ; à défaut, le premier tracé linéaire d'au moins trois sommets.
 *
 * Dans Google Earth Pro, beaucoup de parcelles sont dessinées avec « Ajouter
 * un chemin » plutôt qu'« Ajouter un polygone » : le fichier contient alors
 * une `LineString`, fermée ou non. On l'accepte comme contour — un tracé
 * autour d'un terrain n'a pas d'autre sens.
 *
 * Quand le fichier contient plusieurs polygones, le premier est retenu ; les
 * autres restent visibles en superposition et dans le KML exporté.
 */
export function firstPolygonRing(geojson: unknown): ExtractedRing | null {
  const collection = geojson as GeoJsonCollection | null;
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    return null;
  }

  const toRing = (
    feature: GeoJsonFeature,
    ring: number[][] | undefined,
  ): ExtractedRing | null => {
    if (!ring || ring.length < 3) return null;

    const points = openRing(
      ring
        .filter((tuple) => tuple.length >= 2)
        .map(([longitude, latitude, altitude]) => ({
          latitude,
          longitude,
          altitude: altitude ?? null,
        })),
    );

    return points.length >= 3 ? { name: feature.properties?.name ?? null, points } : null;
  };

  // 1. Polygones, dans l'ordre du fichier.
  for (const feature of collection.features) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    if (geometry.type === 'Polygon') {
      const ring = toRing(feature, (geometry.coordinates as number[][][])[0]);
      if (ring) return ring;
    } else if (geometry.type === 'MultiPolygon') {
      const ring = toRing(feature, (geometry.coordinates as number[][][][])[0]?.[0]);
      if (ring) return ring;
    }
  }

  // 2. Tracés linéaires — un chemin autour de la parcelle.
  for (const feature of collection.features) {
    const geometry = feature.geometry;
    if (geometry?.type !== 'LineString') continue;

    const ring = toRing(feature, geometry.coordinates as number[][]);
    if (ring) return ring;
  }

  return null;
}

/** Points isolés d'une FeatureCollection (bornes relevées au GPS). */
export function pointsOf(geojson: unknown): GeoPoint[] {
  const collection = geojson as GeoJsonCollection | null;
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    return [];
  }

  return collection.features.flatMap((feature) => {
    if (feature.geometry?.type !== 'Point') return [];
    const [longitude, latitude, altitude] = feature.geometry.coordinates as number[];
    return [
      {
        latitude,
        longitude,
        altitude: altitude ?? null,
        label: feature.properties?.name ?? null,
      },
    ];
  });
}
