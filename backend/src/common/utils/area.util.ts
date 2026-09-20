import { AreaUnit } from '@prisma/client';

/** Facteurs de conversion vers le mètre carré. */
const TO_SQUARE_METERS: Record<AreaUnit, number> = {
  [AreaUnit.M2]: 1,
  [AreaUnit.ARE]: 100,
  [AreaUnit.HECTARE]: 10_000,
};

/**
 * Convertit une superficie en m².
 *
 * Toutes les comparaisons, totaux et filtres passent par cette normalisation :
 * comparer directement des valeurs saisies en hectares et en m² donnerait des
 * résultats faux.
 */
export function toSquareMeters(area: number, unit: AreaUnit): number {
  return Math.round(area * TO_SQUARE_METERS[unit] * 100) / 100;
}

export function fromSquareMeters(squareMeters: number, unit: AreaUnit): number {
  return Math.round((squareMeters / TO_SQUARE_METERS[unit]) * 100) / 100;
}

/** Formatage lisible : m² en dessous d'un hectare, hectares au-delà. */
export function formatArea(squareMeters: number): string {
  if (squareMeters >= 10_000) {
    return `${(squareMeters / 10_000).toLocaleString('fr-FR', {
      maximumFractionDigits: 2,
    })} ha`;
  }

  return `${squareMeters.toLocaleString('fr-FR', {
    maximumFractionDigits: 2,
  })} m²`;
}
