import {
  addDays,
  addMs,
  parseDurationToMs,
  parseDurationToSeconds,
} from './duration.util';

describe('duration.util', () => {
  describe('parseDurationToMs', () => {
    it.each([
      ['30s', 30_000],
      ['15m', 900_000],
      ['12h', 43_200_000],
      ['7d', 604_800_000],
      ['900', 900_000], // sans unité : secondes
    ])('convertit %s', (input, expected) => {
      expect(parseDurationToMs(input)).toBe(expected);
    });

    it('accepte les espaces et la casse', () => {
      expect(parseDurationToMs(' 15 M ')).toBe(900_000);
    });

    it('rejette une durée invalide plutôt que de renvoyer NaN', () => {
      expect(() => parseDurationToMs('deux jours')).toThrow(/Durée invalide/);
      expect(() => parseDurationToMs('7w')).toThrow(/Durée invalide/);
    });
  });

  it('parseDurationToSeconds arrondit à la seconde inférieure', () => {
    expect(parseDurationToSeconds('15m')).toBe(900);
  });

  it('addMs et addDays ne mutent pas la date source', () => {
    const source = new Date('2026-01-01T00:00:00.000Z');

    expect(addMs(source, 1_000).toISOString()).toBe('2026-01-01T00:00:01.000Z');
    expect(addDays(source, 30).toISOString()).toBe('2026-01-31T00:00:00.000Z');
    expect(source.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});
