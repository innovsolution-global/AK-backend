import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { AreaUnit } from '@/types/domain';

const AREA_FACTORS: Record<AreaUnit, number> = {
  M2: 1,
  ARE: 100,
  HECTARE: 10_000,
};

/** Superficie lisible : m² sous l'hectare, hectares au-delà. */
export function formatArea(squareMeters: number | string): string {
  const value = Number(squareMeters);
  if (!Number.isFinite(value)) return '—';

  if (value >= 10_000) {
    return `${value / 10_000 >= 100 ? Math.round(value / 10_000) : round(value / 10_000, 2)} ha`;
  }

  return `${formatNumber(value)} m²`;
}

/** Superficie telle que saisie, avec son unité d'origine. */
export function formatAreaWithUnit(
  area: number | string,
  unit: AreaUnit,
): string {
  const labels: Record<AreaUnit, string> = {
    M2: 'm²',
    ARE: 'are',
    HECTARE: 'ha',
  };

  return `${formatNumber(Number(area))} ${labels[unit]}`;
}

export function toSquareMeters(area: number, unit: AreaUnit): number {
  return area * AREA_FACTORS[unit];
}

export function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—';

  return value.toLocaleString('fr-FR', {
    maximumFractionDigits: decimals,
  });
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';

  const date = typeof value === 'string' ? parseISO(value) : value;
  return isValid(date) ? format(date, 'dd/MM/yyyy', { locale: fr }) : '—';
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';

  const date = typeof value === 'string' ? parseISO(value) : value;
  return isValid(date) ? format(date, "dd/MM/yyyy 'à' HH:mm", { locale: fr }) : '—';
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '—';

  const date = typeof value === 'string' ? parseISO(value) : value;
  if (!isValid(date)) return '—';

  return formatDistanceToNow(date, { addSuffix: true, locale: fr });
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} o`;

  const units = ['Ko', 'Mo', 'Go'];
  let value = bytes / 1024;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${round(value, 1)} ${units[unit]}`;
}

/** Remplace les underscores des énumérations par des espaces. */
export function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word, index) =>
      index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word,
    )
    .join(' ');
}

export function formatCoordinate(value: number | string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(6) : '—';
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
