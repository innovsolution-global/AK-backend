import { Injectable } from '@nestjs/common';
import { parcelRing } from '../common/utils/geo.util';

export interface KmlPoint {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  label?: string | null;
  isPrimary?: boolean;
}

export interface KmlPropertyInput {
  reference: string;
  name: string;
  locationName: string;
  siteName?: string | null;
  areaLabel: string;
  status: string;
  description?: string | null;
  googleMapsUrl?: string | null;
  coordinates: KmlPoint[];
  /** Géométries GeoJSON extraites des fichiers importés, ajoutées telles quelles. */
  extractedGeometries?: unknown[];
}

/**
 * Génération de fichiers KML (§12).
 *
 * Un terrain saisi avec ses bornes doit pouvoir s'ouvrir dans Google Earth
 * même si aucun fichier n'a été importé : on construit le KML depuis les
 * coordonnées. Le style reprend le code des géomètres — contour cyan sur fond
 * satellite, qui reste lisible quelle que soit la couleur des toits.
 */
@Injectable()
export class KmlBuilderService {
  build(input: KmlPropertyInput): string {
    const ordered = [...input.coordinates];
    const primary = ordered.find((point) => point.isPrimary) ?? ordered[0];
    const ring = parcelRing(ordered);

    const placemarks: string[] = [];

    // Polygone d'emprise si au moins trois bornes.
    if (ring.length >= 3) {
      const closed = [...ring, ring[0]!];
      placemarks.push(`
    <Placemark>
      <name>${escape(input.reference)} — emprise</name>
      <styleUrl>#emprise</styleUrl>
      <Polygon>
        <tessellate>1</tessellate>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              ${closed.map(coordinateTuple).join('\n              ')}
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`);
    }

    // Point principal : le repère, avec la fiche en bulle.
    if (primary) {
      placemarks.push(`
    <Placemark>
      <name>${escape(input.reference)}</name>
      <description><![CDATA[${this.describe(input)}]]></description>
      <styleUrl>#repere</styleUrl>
      <Point>
        <coordinates>${coordinateTuple(primary)}</coordinates>
      </Point>
    </Placemark>`);
    }

    // Bornes individuelles, numérotées dans l'ordre de saisie.
    ring.forEach((point, index) => {
      // Le repère porte déjà son propre Placemark.
      if (point === primary) return;
      placemarks.push(`
    <Placemark>
      <name>${escape(point.label ?? `Borne ${index + 1}`)}</name>
      <styleUrl>#borne</styleUrl>
      <Point>
        <coordinates>${coordinateTuple(point)}</coordinates>
      </Point>
    </Placemark>`);
    });

    // Géométries importées (KML/KMZ analysés) : reconverties en KML.
    for (const geometry of input.extractedGeometries ?? []) {
      placemarks.push(...this.geoJsonToPlacemarks(geometry, input.reference));
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escape(input.reference)} — ${escape(input.name)}</name>
    <description><![CDATA[Exporté depuis AK IMMO. ${escape(input.locationName)}${
      input.siteName ? ` · ${escape(input.siteName)}` : ''
    } · ${escape(input.areaLabel)}]]></description>
    <open>1</open>

    <Style id="emprise">
      <LineStyle><color>ffffe000</color><width>4</width></LineStyle>
      <PolyStyle><color>33ffe000</color><fill>1</fill><outline>1</outline></PolyStyle>
    </Style>
    <Style id="repere">
      <IconStyle>
        <scale>1.3</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/orange-circle.png</href></Icon>
      </IconStyle>
      <LabelStyle><scale>1.1</scale></LabelStyle>
    </Style>
    <Style id="borne">
      <IconStyle>
        <scale>0.8</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>
      </IconStyle>
      <LabelStyle><scale>0.8</scale></LabelStyle>
    </Style>
${placemarks.join('\n')}
  </Document>
</kml>
`;
  }

  private describe(input: KmlPropertyInput): string {
    const rows: Array<[string, string]> = [
      ['Référence', input.reference],
      ['Nom', input.name],
      ['Localisation', [input.locationName, input.siteName].filter(Boolean).join(' · ')],
      ['Superficie', input.areaLabel],
      ['Statut', input.status.replace(/_/g, ' ').toLowerCase()],
    ];

    const table = rows
      .map(
        ([label, value]) =>
          `<tr><td style="color:#666;padding-right:12px">${escape(label)}</td><td><b>${escape(value)}</b></td></tr>`,
      )
      .join('');

    const description = input.description ? `<p>${escape(input.description)}</p>` : '';
    const link = input.googleMapsUrl
      ? `<p><a href="${escape(input.googleMapsUrl)}">Ouvrir dans Google Maps</a></p>`
      : '';

    return `<div style="font-family:sans-serif;font-size:13px"><table>${table}</table>${description}${link}</div>`;
  }

  /** Convertit une FeatureCollection GeoJSON en Placemarks KML. */
  private geoJsonToPlacemarks(geometry: unknown, prefix: string): string[] {
    const collection = geometry as {
      type?: string;
      features?: Array<{
        properties?: { name?: string; description?: string };
        geometry?: { type: string; coordinates: unknown };
      }>;
    };

    if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
      return [];
    }

    return collection.features.flatMap((feature) => {
      const name = escape(feature.properties?.name ?? `${prefix} — import`);
      const geom = feature.geometry;
      if (!geom) return [];

      switch (geom.type) {
        case 'Point': {
          const [lng, lat, alt] = geom.coordinates as number[];
          return [
            `
    <Placemark>
      <name>${name}</name>
      <styleUrl>#borne</styleUrl>
      <Point><coordinates>${lng},${lat},${alt ?? 0}</coordinates></Point>
    </Placemark>`,
          ];
        }
        case 'LineString': {
          const coords = (geom.coordinates as number[][]).map(
            ([lng, lat, alt]) => `${lng},${lat},${alt ?? 0}`,
          );
          return [
            `
    <Placemark>
      <name>${name}</name>
      <styleUrl>#emprise</styleUrl>
      <LineString><tessellate>1</tessellate><coordinates>${coords.join(' ')}</coordinates></LineString>
    </Placemark>`,
          ];
        }
        case 'Polygon': {
          const rings = geom.coordinates as number[][][];
          const outer = rings[0] ?? [];
          const coords = outer.map(([lng, lat, alt]) => `${lng},${lat},${alt ?? 0}`);
          return [
            `
    <Placemark>
      <name>${name}</name>
      <styleUrl>#emprise</styleUrl>
      <Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${coords.join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>`,
          ];
        }
        default:
          return [];
      }
    });
  }
}

/** KML attend `longitude,latitude,altitude` — l'inverse de l'usage courant. */
function coordinateTuple(point: KmlPoint): string {
  return `${point.longitude},${point.latitude},${point.altitude ?? 0}`;
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
