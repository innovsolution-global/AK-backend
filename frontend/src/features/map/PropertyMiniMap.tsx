import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { statusMarkerIcon } from './markerIcon';
import type { PropertyStatus } from '@/types/domain';
import { formatCoordinate } from '@/utils/format';

interface PropertyMiniMapProps {
  latitude: number;
  longitude: number;
  label: string;
  status: PropertyStatus;
  height?: number;
}

/** Aperçu cartographique non interactif, affiché dans la fiche d'un bien. */
export function PropertyMiniMap({
  latitude,
  longitude,
  label,
  status,
  height = 220,
}: PropertyMiniMapProps) {
  return (
    <div>
      <MapContainer
        center={[latitude, longitude]}
        zoom={15}
        style={{ height }}
        // Carte de contexte : la molette ne doit pas capturer le défilement de
        // la page quand on la survole en lisant la fiche.
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
        />
        <Marker position={[latitude, longitude]} icon={statusMarkerIcon(status)} />
      </MapContainer>

      <div className="border-t border-slate-100 dark:border-white/5 px-4 py-2.5">
        <p className="text-xs font-medium text-ink-soft dark:text-slate-300">{label}</p>
        <p className="tabular mt-0.5 text-xs text-ink-muted">
          {formatCoordinate(latitude)}, {formatCoordinate(longitude)}
        </p>
      </div>
    </div>
  );
}
