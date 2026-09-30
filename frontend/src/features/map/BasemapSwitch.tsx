import { useEffect, useId, useState } from 'react';
import { TileLayer, useMap } from 'react-leaflet';
import { motion } from 'framer-motion';
import {
  BASEMAPS,
  readPreferredBasemap,
  storePreferredBasemap,
  type BasemapId,
} from './basemaps';

/** État partagé fond de carte + sélecteur, à poser autour d'un `MapContainer`. */
export function useBasemap(fallback: BasemapId = 'satellite') {
  const [basemap, setBasemap] = useState<BasemapId>(() => readPreferredBasemap(fallback));

  const select = (id: BasemapId) => {
    setBasemap(id);
    storePreferredBasemap(id);
  };

  return { basemap, select, definition: BASEMAPS[basemap] };
}

/** Couche de tuiles du fond sélectionné, avec la classe qui pilote le thème. */
export function BasemapLayer({ basemap }: { basemap: BasemapId }) {
  const map = useMap();
  const definition = BASEMAPS[basemap];

  useEffect(() => {
    const container = map.getContainer();
    for (const candidate of Object.values(BASEMAPS)) {
      container.classList.toggle(candidate.className, candidate.id === basemap);
    }
  }, [map, basemap]);

  return (
    <TileLayer
      key={definition.id}
      url={definition.url}
      attribution={definition.attribution}
      maxZoom={definition.maxZoom}
    />
  );
}

interface BasemapSwitchProps {
  value: BasemapId;
  onChange: (id: BasemapId) => void;
  className?: string;
}

/**
 * Sélecteur Plan / Satellite, à superposer à la carte (`absolute`).
 * Même pilule que les onglets de l'application, pour ne pas ressembler à un
 * contrôle Leaflet étranger.
 */
export function BasemapSwitch({ value, onChange, className = '' }: BasemapSwitchProps) {
  // Plusieurs cartes peuvent cohabiter sur une page : chaque sélecteur anime
  // sa propre pilule.
  const layoutId = useId();

  return (
    <div
      role="radiogroup"
      aria-label="Fond de carte"
      className={`pointer-events-auto inline-flex rounded-pill bg-white/90 p-1 shadow-card backdrop-blur dark:bg-night-800/90 ${className}`}
    >
      {Object.values(BASEMAPS).map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.id)}
            className={`relative rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors ${
              active ? 'text-white' : 'text-ink-soft hover:text-ink dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            {active && (
              <motion.span
                layoutId={`basemap-active-${layoutId}`}
                className="absolute inset-0 rounded-pill bg-gradient-brand shadow-glow-brand"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
