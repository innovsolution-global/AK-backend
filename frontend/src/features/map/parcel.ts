import type { Coordinate } from '@/types/domain';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ParcelPoint extends LatLng {
  label: string | null;
  isPrimary: boolean;
}

/** Couleur de l'emprise : cyan, lisible sur toute imagerie satellite. */
export const PARCEL_COLOR = '#22d3ee';
export const PARCEL_HALO = '#0e7490';

export function toParcelPoints(coordinates: Coordinate[]): ParcelPoint[] {
  return coordinates
    .map((point) => ({
      lat: Number(point.latitude),
      lng: Number(point.longitude),
      label: point.label ?? null,
      isPrimary: point.isPrimary,
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

/**
 * Sommets de l'emprise — même convention que le backend (`parcelRing`) :
 * le point principal est le repère et ne fait pas partie du contour, sauf si
 * l'on n'a que des sommets.
 */
export function parcelRing<T extends { isPrimary: boolean }>(points: T[]): T[] {
  const vertices = points.filter((point) => !point.isPrimary);
  if (vertices.length >= 3) return vertices;
  if (points.length >= 3) return points;
  return [];
}

export function primaryPoint(points: ParcelPoint[]): ParcelPoint | null {
  return points.find((point) => point.isPrimary) ?? points[0] ?? null;
}

export function centroid(points: LatLng[]): LatLng | null {
  if (points.length === 0) return null;
  if (points.length < 3) return mean(points);

  let doubleArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const cross = a.lng * b.lat - b.lng * a.lat;
    doubleArea += cross;
    cx += (a.lng + b.lng) * cross;
    cy += (a.lat + b.lat) * cross;
  }

  if (Math.abs(doubleArea) < 1e-12) return mean(points);
  const factor = 1 / (3 * doubleArea);
  return { lng: cx * factor, lat: cy * factor };
}

function mean(points: LatLng[]): LatLng {
  const sum = points.reduce(
    (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

/** Superficie d'un anneau en m² (projection locale, même méthode que le backend). */
export function ringAreaSqm(points: LatLng[]): number {
  if (points.length < 3) return 0;

  const center = mean(points);
  const metersPerDegree = 111_320;
  const metersPerLngDegree = metersPerDegree * Math.cos((center.lat * Math.PI) / 180);

  const projected = points.map((point) => ({
    x: (point.lng - center.lng) * metersPerLngDegree,
    y: (point.lat - center.lat) * metersPerDegree,
  }));

  let doubleArea = 0;
  for (let i = 0; i < projected.length; i += 1) {
    const a = projected[i]!;
    const b = projected[(i + 1) % projected.length]!;
    doubleArea += a.x * b.y - b.x * a.y;
  }

  return Math.round(Math.abs(doubleArea) / 2);
}

/** Anneau extérieur GeoJSON `[lng, lat]` → positions Leaflet `[lat, lng]`. */
export function geoJsonRingToLatLngs(ring: number[][]): Array<[number, number]> {
  return ring
    .filter((tuple) => tuple.length >= 2)
    .map(([lng, lat]) => [lat!, lng!] as [number, number]);
}

/**
 * URL Google Earth Web cadrée sur le terrain.
 *
 * Format « caméra » : `@lat,lng,altitude a, distance d, fov y, heading h,
 * tilt t, roll r`. La distance est dérivée de la superficie pour que
 * l'emprise remplisse l'écran sans le déborder.
 */
export function earthWebUrl(center: LatLng, areaSqm: number): string {
  const side = Math.sqrt(Math.max(areaSqm, 2_500));
  const distance = Math.round(Math.min(Math.max(side * 3.2, 350), 12_000));
  return `https://earth.google.com/web/@${center.lat.toFixed(7)},${center.lng.toFixed(7)},0a,${distance}d,35y,0h,0t,0r`;
}
