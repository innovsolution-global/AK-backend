const UNIT_TO_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Convertit une durée de la forme `15m`, `7d`, `900` (secondes) en millisecondes.
 *
 * Les durées de configuration doivent être lisibles dans le `.env` ; cette
 * fonction évite de dupliquer partout le calcul manuel `7 * 24 * 60 * 60 * 1000`.
 */
export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)\s*([smhd])?$/i.exec(duration.trim());

  if (!match) {
    throw new Error(
      `Durée invalide : « ${duration} ». Formats acceptés : 30s, 15m, 12h, 7d.`,
    );
  }

  const amount = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();

  return amount * UNIT_TO_MS[unit];
}

export function parseDurationToSeconds(duration: string): number {
  return Math.floor(parseDurationToMs(duration) / 1000);
}

export function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

export function addDays(date: Date, days: number): Date {
  return addMs(date, days * UNIT_TO_MS.d);
}
