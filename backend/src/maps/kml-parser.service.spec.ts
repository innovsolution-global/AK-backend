import JSZip from 'jszip';
import { firstPolygonRing } from '../common/utils/geo.util';
import { KmlParserService, decodeXml } from './kml-parser.service';

/** Anneau de Tanéné (Google Earth Pro), tel que livré : tabulations, retours, 14 décimales. */
const TANENE_RING = `
						-13.48629086303393,9.802506093633456,0 -13.48545202509761,9.802640632986598,0 -13.48505588475878,9.80294054995079,0 -13.48422445383327,9.803173762025898,0 -13.48629086303393,9.802506093633456,0
					`;

function kml(
  body: string,
  root = 'kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"',
) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${root}><Document><name>test</name>${body}</Document></kml>`;
}

const parser = new KmlParserService();

describe('KmlParserService — variantes de fichiers réels', () => {
  it('lit un polygone Google Earth Pro (tabulations, altitude, anneau fermé)', async () => {
    const result = await parser.parse(
      Buffer.from(
        kml(`<Placemark><name>AK_TANENE_DUB</name><styleUrl>#m_ylw-pushpin</styleUrl>
          <Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${TANENE_RING}</coordinates></LinearRing></outerBoundaryIs></Polygon>
          <atom:link xmlns:atom="http://www.w3.org/2005/Atom" rel="app" href="https://www.google.com/earth/about/versions/#earth-pro" title="Google Earth Pro 7.3.7.1327"></atom:link>
        </Placemark>`),
      ),
      'KML',
    );

    expect(result.status).toBe('SUCCESS');
    expect(result.featureCount).toBe(1);
    const polygon = result.geojson!.features[0].geometry;
    expect(polygon.type).toBe('Polygon');
    // Les 14 décimales sont conservées telles quelles.
    expect((polygon as { coordinates: number[][][] }).coordinates[0][0]).toEqual([
      -13.48629086303393, 9.802506093633456, 0,
    ]);
    expect(firstPolygonRing(result.geojson)?.points).toHaveLength(4);
  });

  it('lit un KMZ dont le document ne s’appelle pas doc.kml et vit dans un dossier', async () => {
    const zip = new JSZip();
    zip.file(
      'export/parcelle_12.kml',
      kml(
        `<Folder><name>Relevés</name><Placemark><name>P12</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${TANENE_RING}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Folder>`,
      ),
    );
    zip.file('files/photo.jpg', Buffer.from([0xff, 0xd8, 0xff]));
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await parser.parse(buffer, 'KMZ');

    expect(result.status).toBe('SUCCESS');
    expect(result.geojson!.features[0].properties.name).toBe('P12');
  });

  it('garde le polygone d’un MultiGeometry qui contient aussi une épingle', async () => {
    const result = await parser.parse(
      Buffer.from(
        kml(`<Placemark><name>Domaine</name><MultiGeometry>
          <Point><coordinates>-13.485,9.803,0</coordinates></Point>
          <Polygon><outerBoundaryIs><LinearRing><coordinates>${TANENE_RING}</coordinates></LinearRing></outerBoundaryIs></Polygon>
        </MultiGeometry></Placemark>`),
      ),
      'KML',
    );

    expect(result.featureCount).toBe(2);
    expect(result.geojson!.features.map((f) => f.geometry.type)).toEqual([
      'Polygon',
      'Point',
    ]);
    expect(firstPolygonRing(result.geojson)?.points).toHaveLength(4);
  });

  it('accepte un LinearRing nu (hors Polygon) comme emprise', async () => {
    const result = await parser.parse(
      Buffer.from(
        kml(
          `<Placemark><name>Contour</name><LinearRing><coordinates>${TANENE_RING}</coordinates></LinearRing></Placemark>`,
        ),
      ),
      'KML',
    );

    expect(result.status).toBe('SUCCESS');
    expect(result.geojson!.features[0].geometry.type).toBe('Polygon');
  });

  it('accepte un chemin (LineString) non fermé comme contour de parcelle', async () => {
    const open = `-13.4863,9.8025,0 -13.4854,9.8026,0 -13.4850,9.8029,0 -13.4842,9.8031,0`;
    const result = await parser.parse(
      Buffer.from(
        kml(
          `<Placemark><name>Chemin</name><LineString><tessellate>1</tessellate><coordinates>${open}</coordinates></LineString></Placemark>`,
        ),
      ),
      'KML',
    );

    expect(result.geojson!.features[0].geometry.type).toBe('LineString');
    const ring = firstPolygonRing(result.geojson);
    expect(ring?.points).toHaveLength(4);
    expect(ring?.name).toBe('Chemin');
  });

  it('préfère un polygone à une ligne, quel que soit l’ordre dans le fichier', async () => {
    const result = await parser.parse(
      Buffer.from(
        kml(`<Placemark><name>Accès</name><LineString><coordinates>-13.49,9.80,0 -13.48,9.80,0 -13.47,9.81,0</coordinates></LineString></Placemark>
             <Placemark><name>Parcelle</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${TANENE_RING}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`),
      ),
      'KML',
    );

    expect(firstPolygonRing(result.geojson)?.name).toBe('Parcelle');
  });

  it('tolère des espaces après les virgules et des tuples sans altitude', async () => {
    const result = await parser.parse(
      Buffer.from(
        kml(`<Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
          -13.4863, 9.8025
          -13.4854, 9.8026
          -13.4850, 9.8029
          -13.4863, 9.8025
        </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`),
      ),
      'KML',
    );

    expect(result.status).toBe('SUCCESS');
    const ring = (result.geojson!.features[0].geometry as { coordinates: number[][][] })
      .coordinates[0];
    expect(ring).toHaveLength(4);
    expect(ring[1]).toEqual([-13.4854, 9.8026]);
  });

  it('lit un fichier UTF-8 avec BOM et un fichier UTF-16 LE', async () => {
    const body = kml(
      `<Placemark><Point><coordinates>-13.485,9.803,0</coordinates></Point></Placemark>`,
    );

    const withBom = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(body, 'utf8'),
    ]);
    expect((await parser.parse(withBom, 'KML')).status).toBe('SUCCESS');

    const utf16 = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(body, 'utf16le'),
    ]);
    expect(decodeXml(utf16).startsWith('<?xml')).toBe(true);
    expect((await parser.parse(utf16, 'KML')).status).toBe('SUCCESS');
  });

  it('lit un KML 2.1 (ancien espace de noms) et des balises préfixées', async () => {
    const result = await parser.parse(
      Buffer.from(
        kml(
          `<kml:Placemark><kml:name>Ancien</kml:name><kml:Polygon><kml:outerBoundaryIs><kml:LinearRing><kml:coordinates>${TANENE_RING}</kml:coordinates></kml:LinearRing></kml:outerBoundaryIs></kml:Polygon></kml:Placemark>`,
          'kml xmlns="http://earth.google.com/kml/2.1" xmlns:kml="http://earth.google.com/kml/2.1"',
        ),
      ),
      'KML',
    );

    expect(result.status).toBe('SUCCESS');
    expect(result.geojson!.features[0].properties.name).toBe('Ancien');
  });

  it('signale PARTIAL quand un repère est vide, FAILED quand rien n’est lisible', async () => {
    const partial = await parser.parse(
      Buffer.from(
        kml(`<Placemark><name>Sans géométrie</name></Placemark>
             <Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>${TANENE_RING}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`),
      ),
      'KML',
    );
    expect(partial.status).toBe('PARTIAL');
    expect(partial.featureCount).toBe(1);

    const failed = await parser.parse(
      Buffer.from(kml(`<Placemark><name>Vide</name></Placemark>`)),
      'KML',
    );
    expect(failed.status).toBe('FAILED');
    expect(failed.error).toMatch(/Aucune géométrie/);

    const notXml = await parser.parse(Buffer.from('ceci n’est pas du KML'), 'KML');
    expect(notXml.status).toBe('FAILED');
  });
});
