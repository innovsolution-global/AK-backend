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
        format === 'KMZ' ? await this.extractKmlFromKmz(buffer) : decodeXml(buffer);

      if (!xml) {
        return this.failure("Aucun document KML trouvé dans l'archive.");
      }

      // `await` obligatoire : renvoyer la promesse sans l'attendre ferait
      // échapper un XML malformé au `catch` — 500 au lieu d'un statut FAILED.
      return await this.parseKml(xml);
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
    const entry = zip.file(/^doc\.kml$/i)[0] ?? zip.file(/\.kml$/i)[0] ?? null;

    return entry ? decodeXml(await entry.async('nodebuffer')) : null;
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
      const extracted = this.toFeatures(placemark);
      if (extracted.length > 0) features.push(...extracted);
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

  /**
   * Toutes les géométries d'un Placemark, y compris dans un `MultiGeometry`.
   *
   * Un géomètre livre souvent le polygone **et** une épingle au centre dans
   * le même repère : ne garder que la première géométrie rencontrée aurait
   * perdu l'emprise. Ordre de sortie : polygones, anneaux nus, lignes, points
   * — celui que suit la reprise d'emprise.
   */
  private toFeatures(placemark: Record<string, unknown>): GeoJsonFeature[] {
    const properties = {
      name: this.firstString(placemark, 'name'),
      description: this.firstString(placemark, 'description'),
    };

    const features: GeoJsonFeature[] = [];

    const polygons = this.collect(placemark, 'Polygon');
    const ringsInsidePolygons = new Set(
      polygons.flatMap((polygon) => this.collect(polygon, 'LinearRing')),
    );

    for (const polygon of polygons) {
      const outer = this.collect(polygon, 'outerBoundaryIs')[0];
      // Sans `outerBoundaryIs`, certains outils placent l'anneau directement.
      const ring = outer
        ? this.collect(outer, 'LinearRing')[0]
        : this.collect(polygon, 'LinearRing')[0];
      const feature = this.polygonFeature(
        this.parseCoordinates(ring ? this.firstString(ring, 'coordinates') : undefined),
        properties,
      );
      if (feature) features.push(feature);
    }

    // `LinearRing` hors de tout Polygon : un contour tracé comme un anneau.
    for (const ring of this.collect(placemark, 'LinearRing')) {
      if (ringsInsidePolygons.has(ring)) continue;
      const feature = this.polygonFeature(
        this.parseCoordinates(this.firstString(ring, 'coordinates')),
        properties,
      );
      if (feature) features.push(feature);
    }

    for (const line of this.collect(placemark, 'LineString')) {
      const coords = this.parseCoordinates(this.firstString(line, 'coordinates'));
      if (coords.length >= 2) {
        features.push({
          type: 'Feature',
          properties,
          geometry: { type: 'LineString', coordinates: coords },
        });
      }
    }

    for (const point of this.collect(placemark, 'Point')) {
      const coords = this.parseCoordinates(this.firstString(point, 'coordinates'));
      if (coords.length > 0) {
        features.push({
          type: 'Feature',
          properties,
          geometry: { type: 'Point', coordinates: coords[0] },
        });
      }
    }

    return features;
  }

  private polygonFeature(
    coords: number[][],
    properties: GeoJsonFeature['properties'],
  ): GeoJsonFeature | null {
    if (coords.length < 3) return null;

    // Un anneau GeoJSON doit être explicitement fermé.
    const first = coords[0];
    const last = coords[coords.length - 1];
    const closed =
      first[0] === last[0] && first[1] === last[1] ? coords : [...coords, first];

    // Trois sommets distincts au minimum, une fois fermé.
    if (closed.length < 4) return null;

    return {
      type: 'Feature',
      properties,
      geometry: { type: 'Polygon', coordinates: [closed] },
    };
  }

  /**
   * Les coordonnées KML s'écrivent `lon,lat[,alt]`, séparées par des espaces
   * ou des sauts de ligne — l'ordre est inverse de l'usage courant lat/lon.
   * Certains outils insèrent des espaces après les virgules (`lon, lat`) :
   * on les retire avant de découper sur les blancs.
   */
  private parseCoordinates(raw: string | undefined): number[][] {
    if (!raw) return [];

    return raw
      .replace(/,\s+/g, ',')
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

  private firstString(node: Record<string, unknown>, key: string): string | undefined {
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

/**
 * Décode un document XML quel que soit son encodage de départ : UTF-8 avec ou
 * sans BOM, UTF-16 LE/BE (exports SIG Windows). Un BOM laissé en tête ferait
 * échouer l'analyseur sur « caractère avant la première balise ».
 */
export function decodeXml(buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le').trimStart();
  }
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    return Buffer.from(buffer.subarray(2)).swap16().toString('utf16le').trimStart();
  }
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8').trimStart();
  }
  return buffer.toString('utf8').trimStart();
}
