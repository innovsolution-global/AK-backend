import { useEffect, useId, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useChartTheme } from './theme';

interface GaugeProps {
  /** Ratio entre 0 et 1. */
  value: number;
  /** Contenu affiché au centre (le chiffre héros). */
  children: ReactNode;
  size?: number;
  thickness?: number;
}

/**
 * Jauge semi-circulaire : un ratio contre une limite.
 *
 * La méthode dataviz prescrit pour un « meter » une piste dans une teinte
 * plus claire de la même gamme que le remplissage — c'est ce que fait le
 * design de référence avec son dégradé jaune→orange sur une piste pêche.
 * L'arc grandit de zéro à sa valeur : le mouvement montre la proportion.
 */
export function Gauge({ value, children, size = 280, thickness = 34 }: GaugeProps) {
  const theme = useChartTheme();
  const reduced = useReducedMotion();
  const id = useId().replace(/:/g, '');
  const target = Math.max(0, Math.min(1, value));
  const [progress, setProgress] = useState(reduced ? target : 0);

  useEffect(() => {
    if (reduced) {
      setProgress(target);
      return;
    }
    const frame = window.requestAnimationFrame(() => setProgress(target));
    return () => window.cancelAnimationFrame(frame);
  }, [target, reduced]);

  const radius = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  // Demi-cercle ouvert vers le bas : de 180° à 360°.
  const circumference = Math.PI * radius;
  const dash = circumference * progress;

  const arc = `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size / 2 + thickness / 2 }}>
      <svg
        width={size}
        height={size / 2 + thickness / 2}
        viewBox={`0 0 ${size} ${size / 2 + thickness / 2}`}
        className="overflow-visible"
        role="img"
        aria-label={`${Math.round(target * 100)} %`}
      >
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="55%" stopColor="#fb923c" />
            <stop offset="100%" stopColor={theme.series} />
          </linearGradient>
          <linearGradient id={`${id}-track`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fde68a" stopOpacity={0.35} />
            <stop offset="100%" stopColor={theme.series} stopOpacity={0.18} />
          </linearGradient>
        </defs>

        {/* Piste : même gamme, très atténuée. */}
        <path
          d={arc}
          fill="none"
          stroke={`url(#${id}-track)`}
          strokeWidth={thickness}
          strokeLinecap="round"
        />

        {/* Remplissage animé de gauche à droite. */}
        <path
          d={arc}
          fill="none"
          stroke={`url(#${id}-fill)`}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: reduced ? undefined : 'stroke-dasharray 1.1s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end text-center">
        {children}
      </div>
    </div>
  );
}
