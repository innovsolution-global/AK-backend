import { AreaUnit } from '@prisma/client';
import { formatArea, fromSquareMeters, toSquareMeters } from './area.util';

describe('area.util', () => {
  describe('toSquareMeters', () => {
    it.each([
      [1500, AreaUnit.M2, 1500],
      [15, AreaUnit.ARE, 1500],
      [1.5, AreaUnit.HECTARE, 15_000],
    ])('convertit %s %s en %s m²', (area, unit, expected) => {
      expect(toSquareMeters(area, unit)).toBe(expected);
    });

    it('arrondit au centime de m² pour rester aligné sur Decimal(16,2)', () => {
      expect(toSquareMeters(1.23456, AreaUnit.HECTARE)).toBe(12345.6);
    });
  });

  it('fromSquareMeters est réciproque de toSquareMeters', () => {
    const squareMeters = toSquareMeters(2.75, AreaUnit.HECTARE);

    expect(squareMeters).toBe(27_500);
    expect(fromSquareMeters(squareMeters, AreaUnit.HECTARE)).toBe(2.75);
  });

  describe('formatArea', () => {
    it('affiche des m² en dessous d\'un hectare', () => {
      expect(formatArea(2500)).toContain('m²');
    });

    it('bascule en hectares à partir de 10 000 m²', () => {
      expect(formatArea(25_000)).toContain('ha');
    });
  });
});
