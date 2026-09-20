import { Injectable, Logger } from '@nestjs/common';
import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';

export interface GeoBounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface ParsedGeoFile {
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  featureCount: number;
  bounds: GeoBounds | null;
  geojson: GeoJsonFeatureCollection | null;
  error?: string;
}

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

interface GeoJsonFeature {
  type: 'Feature';
  properties: { name?: string; description?: string };
  geometry:
    | { type: 'Point'; coordinates: number[] }
    | { type: 'LineString'; coordinates: number[][] }
    | { type: 'Polygon'; coordinates: number[][][] };
}

/** Un KML volumineux est souvent une carte entière : on borne l'analyse. */
const MAX_FEATURES = 5_000;

/**
 * Extraction des données géographiques d'un fichier Google Earth (§12).
 *
 * L'analyse est **tolérante** : un fichier dont la géométrie ne peut pas être
 * lue reste stocké, associé au domaine et téléchargeable — seul le statut
 * d'extraction le signale. Refuser le fichier ferait perdre une pièce que
 * l'utilisateur considère comme valide dans Google Earth.
 */
@Injectable()
export class KmlParserService {
  private readonly logger = new Logger(KmlParserService.name);

  async parse(buffer: Buffer, format: 'KML' | 'KMZ'): Promise<ParsedGeoFile> {
    try {
      const xml =
        format === 'KMZ' ? await this.extractKmlFromKmz(buffer) : buffer.toString('utf8');

      if (!xml) {
        return this.failure("Aucun document KML trouvé dans l'archive.");
      }

      return this.parseKml(xml);
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`Extraction géographique impossible : ${message}`);
      return this.failure(message);
    }
  }

  /** Un KMZ est une archive ZIP contenant au moins un `.kml`. */
  private async extractKmlFromKmz(buffer: Buffer): Promise<string | null> {
    const zip = await JSZip.loadAsync(buffer);

    // La convention Google Earth nomme le document principal `doc.kml`, mais
    // beaucoup d'exports utilisent un autre nom : on retombe sur le premier
    // `.kml` rencontré.
    const entry =
      zip.file(/^doc\.kml$/i)[0] ??
      zip.file(/\.kml$/i)[0] ??
      null;

    return entry ? entry.async('string') : null;
  }

  private async parseKml(xml: string): Promise<ParsedGeoFile> {
    const parsed = (await parseStringPromise(xml, {
      explicitArray: true,
      // Les KML exportés par certains outils préfixent les balises (`gx:`),
      // ce qui empêcherait de les retrouver par leur nom simple.
      tagNameProcessors: [(name: string) => name.replace(/^.*:/, '')],
      trim: true,
    })) as Record<string, unknown>;

    const placemarks = this.collect(parsed, 'Placemark');

    if (placemarks.length === 0) {
      return this.failure('Aucun repère (Placemark) trouvé dans le fichier.');
    }

    const features: GeoJsonFeature[] = [];
    let skipped = 0;

    for (const placemark of placemarks.slice(0, MAX_FEATURES)) {
      const feature = this.toFeature(placemark);
      if (feature) features.push(feature);
      else skipped += 1;
    }

    if (features.length === 0) {
      return this.failure('Aucune géométrie exploitable dans le fichier.');
    }

    const bounds = this.computeBounds(features);

    return {
      status: skipped > 0 || placemarks.length > MAX_FEATURES ? 'PARTIAL' : 'SUCCESS',
      featureCount: features.length,
      bounds,
      geojson: { type: 'FeatureCollection', features },
    };
  }

  private toFeature(placemark: Record<string, unknown>): GeoJsonFeature | null {
    const properties = {
      name: this.firstString(placemark, 'name'),
      description: this.firstString(placemark, 'description'),
    };

    const point = this.collect(placemark, 'Point')[0];
    if (point) {
      const coords = this.parseCoordinates(this.firstString(point, 'coordinates'));
      if (coords.length > 0) {
        return { type: 'Feature', properties, geometry: { type: 'Point', coordinates: coords[0] } };
      }
    }

    const line = this.collect(placemark, 'LineString')[0];
    if (line) {
      const coords = this.parseCoordinates(this.firstString(line, 'coordinates'));
      if (coords.length >= 2) {
        return {
          type: 'Feature',
          properties,
          geometry: { type: 'LineString', coordinates: coords },
        };
      }
    }

    const polygon = this.collect(placemark, 'Polygon')[0];
    if (polygon) {
      const outer = this.collect(polygon, 'outerBoundaryIs')[0];
      const ring = outer ? this.collect(outer, 'LinearRing')[0] : undefined;
      const coords = this.parseCoordinates(
        ring ? this.firstString(ring, 'coordinates') : undefined,
      );

      if (coords.length >= 3) {
        // Un anneau GeoJSON doit être explicitement fermé.
        const closed =
          coords[0][0] === coords[coords.length - 1][0] &&
          coords[0][1] === coords[coords.length - 1][1]
            ? coords
            : [...coords, coords[0]];

        return {
          type: 'Feature',
          properties,
          geometry: { type: 'Polygon', coordinates: [closed] },
        };
      }
    }

    return null;
  }

  /**
   * Les coordonnées KML s'écrivent `lon,lat[,alt]`, séparées par des espaces
   * ou des sauts de ligne — l'ordre est inverse de l'usage courant lat/lon.
   */
  private parseCoordinates(raw: string | undefined): number[][] {
    if (!raw) return [];

    return raw
      .split(/\s+/)
      .map((triple) => triple.trim())
      .filter(Boolean)
      .flatMap((triple) => {
        const parts = triple.split(',').map(Number);
        const [lng, lat, alt] = parts;

        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [];
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return [];

        return [Number.isFinite(alt) ? [lng, lat, alt] : [lng, lat]];
      });
  }

  private computeBounds(features: GeoJsonFeature[]): GeoBounds | null {
    const points: number[][] = features.flatMap((feature) => {
      switch (feature.geometry.type) {
        case 'Point':
          return [feature.geometry.coordinates];
        case 'LineString':
          return feature.geometry.coordinates;
        case 'Polygon':
          return feature.geometry.coordinates.flat();
      }
    });

    if (points.length === 0) return null;

    const longitudes = points.map(([lng]) => lng);
    const latitudes = points.map(([, lat]) => lat);

    return {
      minLat: Math.min(...latitudes),
      maxLat: Math.max(...latitudes),
      minLng: Math.min(...longitudes),
      maxLng: Math.max(...longitudes),
    };
  }

  /** Parcourt l'arbre XML et récupère tous les nœuds portant ce nom. */
  private collect(node: unknown, tag: string): Array<Record<string, unknown>> {
    const found: Array<Record<string, unknown>> = [];

    const walk = (current: unknown, depth: number): void => {
      if (depth > 30 || current === null || typeof current !== 'object') return;

      if (Array.isArray(current)) {
        for (const item of current) walk(item, depth + 1);
        return;
      }

      for (const [key, value] of Object.entries(current)) {
        if (key === tag) {
          const entries = Array.isArray(value) ? value : [value];
          for (const entry of entries) {
            if (entry && typeof entry === 'object') {
              found.push(entry as Record<string, unknown>);
            }
          }
          // On ne descend pas dans un nœud déjà collecté : les Placemark ne
          // s'imbriquent pas et cela éviterait des doublons.
          continue;
        }

        walk(value, depth + 1);
      }
    };

    walk(node, 0);
    return found;
  }

  private firstString(
    node: Record<string, unknown>,
    key: string,
  ): string | undefined {
    const value = node[key];
    const first = Array.isArray(value) ? value[0] : value;

    if (typeof first === 'string') return first;
    if (first && typeof first === 'object' && '_' in first) {
      const inner = (first as { _: unknown })._;
      return typeof inner === 'string' ? inner : undefined;
    }

    return undefined;
  }

  private failure(error: string): ParsedGeoFile {
    return {
      status: 'FAILED',
      featureCount: 0,
      bounds: null,
      geojson: null,
      error,
    };
  }
}
