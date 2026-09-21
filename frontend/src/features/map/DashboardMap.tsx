import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { statusMarkerIcon } from './markerIcon';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatArea } from '@/utils/format';
import type { MapMarker } from '@/types/domain';

const FALLBACK_CENTER: [number, number] = [9.6412, -13.5784];

interface DashboardMapProps {
  markers: MapMarker[];
  height?: number;
}

/** Carte du patrimoine intégrée au tableau de bord (§28). */
export function DashboardMap({ markers, height = 340 }: DashboardMapProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 dark:border-white/5">
      <MapContainer
        center={FALLBACK_CENTER}
        zoom={10}
        style={{ height }}
        // Carte de contexte : la molette ne doit pas capturer le défilement de
        // la page. Le zoom reste possible par les boutons.
        scrollWheelZoom={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitToMarkers markers={markers} />

        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.latitude, marker.longitude]}
            icon={statusMarkerIcon(marker.status)}
          >
            <Popup>
              <div className="min-w-48 p-3">
                <p className="text-sm font-semibold text-ink dark:text-white">{marker.reference}</p>
                <p className="mt-0.5 text-xs text-ink-soft dark:text-slate-300">{marker.name}</p>
                <p className="mt-1.5 text-xs text-ink-muted">
                  {marker.locationName} · {formatArea(marker.areaSqm)}
                </p>
                <div className="mt-2">
                  <StatusBadge status={marker.status} kind="property" />
                </div>
                <Link
                  to={`/properties/${marker.id}`}
                  className="mt-3 block rounded-md bg-gradient-brand px-3 py-2 text-center text-xs font-semibold text-white shadow-glow-brand"
                >
                  Ouvrir la fiche
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

function FitToMarkers({ markers }: { markers: MapMarker[] }) {
  const map = useMap();

  useMemo(() => {
    if (markers.length === 0) return;

    if (markers.length === 1) {
      const only = markers[0];
      if (only) map.setView([only.latitude, only.longitude], 14);
      return;
    }

    map.fitBounds(
      markers.map((marker) => [marker.latitude, marker.longitude] as [number, number]),
      { padding: [32, 32], maxZoom: 14 },
    );
  }, [markers, map]);

  return null;
}
