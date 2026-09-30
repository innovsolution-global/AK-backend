export type BasemapId = 'satellite' | 'plan';

export interface Basemap {
  id: BasemapId;
  label: string;
  url: string;
  attribution: string;
  maxZoom: number;
  /** Ajouté sur le conteneur : le thème sombre ne filtre pas l'imagerie. */
  className: string;
}

/**
 * Fonds de carte disponibles.
 *
 * Le satellite est le fond par défaut des emprises : une limite de parcelle
 * se lit par rapport aux murs, pistes et arbres visibles, pas par rapport à
 * un plan abstrait — c'est exactement ce que montre Google Earth.
 */
export const BASEMAPS: Record<BasemapId, Basemap> = {
  satellite: {
    id: 'satellite',
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagerie © Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
    className: 'basemap-satellite',
  },
  plan: {
    id: 'plan',
    label: 'Plan',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    className: 'basemap-plan',
  },
};

const STORAGE_KEY = 'ak-immo.basemap';

export function readPreferredBasemap(fallback: BasemapId): BasemapId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'satellite' || stored === 'plan' ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function storePreferredBasemap(id: BasemapId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Stockage indisponible (navigation privée) : la préférence ne survit pas.
  }
}
