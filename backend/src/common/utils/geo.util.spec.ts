import {
  firstPolygonRing,
  openRing,
  parcelAround,
  parcelRing,
  pointsOf,
  ringAreaSqm,
  ringCentroid,
} from './geo.util';

// Carré de 100 m de côté autour de Conakry (≈ 1 ha).
const CONAKRY = { latitude: 9.6412, longitude: -13.5784 };
const SQUARE = parcelAround(CONAKRY.latitude, CONAKRY.longitude, 10_000, 0);

describe('geo.util', () => {
  describe('parcelAround', () => {
    it('produit quatre bornes dont la superficie approche la valeur demandée', () => {
      expect(SQUARE).toHaveLength(4);

      const area = ringAreaSqm(SQUARE);
      // Le quadrilatère est volontairement irrégulier : ±25 % est acceptable.
      expect(area).toBeGreaterThan(7_500);
      expect(area).toBeLessThan(12_500);
    });

    it('est déterministe pour un même seed', () => {
      expect(parcelAround(9.5, -13.6, 5_000, 3)).toEqual(
        parcelAround(9.5, -13.6, 5_000, 3),
      );
    });
  });

  describe('ringCentroid', () => {
    it('retombe sur le centre du quadrilatère', () => {
      const center = ringCentroid(SQUARE);
      expect(center.latitude).toBeCloseTo(CONAKRY.latitude, 3);
      expect(center.longitude).toBeCloseTo(CONAKRY.longitude, 3);
    });

    it('renvoie la moyenne pour moins de trois points', () => {
      const center = ringCentroid([
        { latitude: 0, longitude: 0 },
        { latitude: 2, longitude: 4 },
      ]);
      expect(center).toEqual({ latitude: 1, longitude: 2 });
    });
  });

  describe('openRing', () => {
    it('retire le point de fermeture', () => {
      const closed = [...SQUARE, SQUARE[0]];
      expect(openRing(closed)).toHaveLength(4);
      expect(openRing(SQUARE)).toHaveLength(4);
    });
  });

  describe('parcelRing', () => {
    it('exclut le repère quand les bornes suffisent', () => {
      const points = [
        { latitude: 9.64, longitude: -13.57, isPrimary: true },
        ...SQUARE.map((point) => ({ ...point, isPrimary: false })),
      ];
      expect(parcelRing(points)).toHaveLength(4);
      expect(parcelRing(points).every((point) => !point.isPrimary)).toBe(true);
    });

    it("garde tous les points si l'un des sommets est le repère", () => {
      const points = SQUARE.map((point, index) => ({ ...point, isPrimary: index === 0 }));
      expect(parcelRing(points.slice(0, 3))).toHaveLength(3);
    });

    it('ne renvoie rien pour un simple repère', () => {
      expect(parcelRing([{ latitude: 1, longitude: 1, isPrimary: true }])).toEqual([]);
    });
  });

  describe('firstPolygonRing', () => {
    const collection = {
      type: 'FeatureCollection',
      features: [
        {
          properties: { name: 'Borne A' },
          geometry: { type: 'Point', coordinates: [-13.57, 9.64, 12] },
        },
        {
          properties: { name: 'Parcelle 12' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-13.58, 9.64],
                [-13.57, 9.64],
                [-13.57, 9.65],
                [-13.58, 9.65],
                [-13.58, 9.64],
              ],
            ],
          },
        },
      ],
    };

    it('renvoie le premier polygone, anneau ouvert, en latitude/longitude', () => {
      const ring = firstPolygonRing(collection);
      expect(ring?.name).toBe('Parcelle 12');
      expect(ring?.points).toHaveLength(4);
      expect(ring?.points[0]).toMatchObject({ latitude: 9.64, longitude: -13.58 });
    });

    it('accepte une ligne fermée comme emprise', () => {
      const line = {
        type: 'FeatureCollection',
        features: [
          {
            geometry: {
              type: 'LineString',
              coordinates: [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            },
          },
        ],
      };
      expect(firstPolygonRing(line)?.points).toHaveLength(3);
    });

    it('renvoie null sans polygone', () => {
      expect(firstPolygonRing({ type: 'FeatureCollection', features: [] })).toBeNull();
      expect(firstPolygonRing(null)).toBeNull();
    });

    it('liste les points isolés', () => {
      expect(pointsOf(collection)).toEqual([
        { latitude: 9.64, longitude: -13.57, altitude: 12, label: 'Borne A' },
      ]);
    });
  });
});
