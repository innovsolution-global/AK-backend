import { useMemo } from 'react';
import { useTheme } from '@/features/theme/ThemeProvider';

/**
 * Jetons visuels des graphiques, par thème.
 *
 * Une seule teinte de série — l'orange `#ea580c`, seule nuance de la marque à
 * passer le validateur de la méthode dataviz **sur les deux surfaces** (bande
 * de luminosité, chroma, contraste ≥ 3:1 sur blanc et sur `#2a2a2a`). Les
 * catégories nominales n'ont pas de couleur par valeur : l'identité est portée
 * par le libellé, la barre porte la grandeur.
 */
export interface ChartTheme {
  series: string;
  /** Dégradé du trait, du jaune vers l'orange — signature du design. */
  seriesGradient: [string, string];
  areaFill: string;
  muted: string;
  grid: string;
  axis: string;
  ink: string;
  inkSecondary: string;
  inkMuted: string;
  surface: string;
  /** Piste des jauges et barres : un pas au-dessus de la surface. */
  track: string;
}

const LIGHT: ChartTheme = {
  series: '#ea580c',
  seriesGradient: ['#fbbf24', '#ea580c'],
  areaFill: 'rgba(249, 115, 22, 0.10)',
  muted: '#cbd5e1',
  grid: '#eef0f4',
  axis: '#dfe3ea',
  ink: '#14142b',
  inkSecondary: '#3d3d5c',
  inkMuted: '#8a8a9e',
  surface: '#ffffff',
  track: '#f1f3f7',
};

const DARK: ChartTheme = {
  series: '#ea580c',
  seriesGradient: ['#fcd34d', '#f97316'],
  areaFill: 'rgba(249, 115, 22, 0.16)',
  muted: '#3a3a40',
  grid: '#33333a',
  axis: '#3f3f47',
  ink: '#ffffff',
  inkSecondary: '#d4d4dc',
  inkMuted: '#8a8a9e',
  surface: '#26262a',
  track: '#33333a',
};

export function useChartTheme(): ChartTheme {
  const { isDark } = useTheme();
  return useMemo(() => (isDark ? DARK : LIGHT), [isDark]);
}

/** Épaisseurs fixes de la méthode : barres ≤ 24 px, lignes 2 px, marqueurs ≥ 8 px. */
export const MARK = {
  barSize: 18,
  barRadius: 4,
  lineWidth: 2.5,
  dotRadius: 4,
  gap: 2,
} as const;

export function axisTick(theme: ChartTheme) {
  return { fill: theme.inkMuted, fontSize: 11, fontFamily: 'inherit', fontWeight: 500 } as const;
}

/** Durée d'entrée des marques ; respecte `prefers-reduced-motion`. */
export function animationDuration(base = 700): number {
  if (typeof window === 'undefined') return base;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : base;
}
