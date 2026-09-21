import L from 'leaflet';
import { propertyStatusColor } from '@/components/ui/StatusBadge';
import type { PropertyStatus } from '@/types/domain';

/**
 * Markers dessinés en SVG plutôt qu'en images.
 *
 * Leaflet référence par défaut des PNG via des chemins relatifs que les
 * bundlers cassent ; un `divIcon` évite ce problème et permet surtout de
 * colorer le marker selon le statut, en cohérence avec les badges (§11).
 */
const cache = new Map<string, L.DivIcon>();

export function statusMarkerIcon(status: PropertyStatus): L.DivIcon {
  const cached = cache.get(status);
  if (cached) return cached;

  const color = propertyStatusColor(status);

  const icon = L.divIcon({
    className: '',
    html: `
      <svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
        <path d="M13 0C5.82 0 0 5.82 0 13c0 9.75 13 21 13 21s13-11.25 13-21c0-7.18-5.82-13-13-13z"
              fill="${color}" stroke="#ffffff" stroke-width="2"/>
        <circle cx="13" cy="13" r="4.5" fill="#ffffff"/>
      </svg>`,
    iconSize: [26, 34],
    // L'ancre est la pointe du repère, pas son centre.
    iconAnchor: [13, 34],
    popupAnchor: [0, -32],
  });

  cache.set(status, icon);
  return icon;
}
