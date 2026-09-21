import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { MARK, useChartTheme } from './theme';

export interface BarListItem {
  key: string;
  label: ReactNode;
  value: number;
  /** Valeur affichée à la pointe ; la valeur brute sinon. */
  display?: string;
  /** Texte secondaire sous la pointe (ex. superficie). */
  secondary?: string;
  /** Ligne mise en avant ; les autres passent en gris de retrait. */
  emphasis?: boolean;
  onClick?: () => void;
}

interface BarListProps {
  items: BarListItem[];
  /** Largeur de la colonne des libellés. */
  labelWidth?: number;
  /** Anime la croissance des barres à l'apparition. */
  animate?: boolean;
  className?: string;
}

/**
 * Barres horizontales à une seule teinte.
 *
 * Rendu en HTML plutôt qu'en SVG : les libellés peuvent alors être des
 * composants (badges de statut), la grandeur reste portée par la longueur, et
 * l'identité par le libellé — jamais par une couleur par catégorie.
 *
 * Spécifications de marque : ≤ 24 px d'épaisseur, extrémité arrondie à 4 px et
 * carrée à la base, écart de 2 px entre barres voisines.
 */
export function BarList({
  items,
  labelWidth = 150,
  animate = true,
  className,
}: BarListProps) {
  const theme = useChartTheme();
  const max = Math.max(...items.map((item) => item.value), 0);
  const [ready, setReady] = useState(!animate);
  const hasEmphasis = items.some((item) => item.emphasis);

  // Les barres partent de zéro puis grandissent : un rendu direct à la bonne
  // largeur ne laisse rien lire de la hiérarchie des valeurs.
  useEffect(() => {
    if (!animate) return;
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, [animate]);

  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-muted">Aucune donnée</p>;
  }

  return (
    <ul className={cn('space-y-1', className)} role="list">
      {items.map((item, index) => {
        const ratio = max > 0 ? item.value / max : 0;
        const dimmed = hasEmphasis && !item.emphasis;
        const Wrapper = item.onClick ? 'button' : 'div';

        return (
          <li key={item.key}>
            <Wrapper
              type={item.onClick ? 'button' : undefined}
              onClick={item.onClick}
              className={cn(
                'group flex w-full items-center gap-3 rounded-xl px-1.5 py-1.5 text-left transition-colors',
                item.onClick && 'hover:bg-slate-50 dark:hover:bg-white/5',
              )}
            >
              <div
                className="shrink-0 truncate text-sm text-ink-soft dark:text-slate-300"
                style={{ width: labelWidth }}
              >
                {item.label}
              </div>

              <div className="relative flex-1" style={{ height: MARK.barSize }}>
                {/* Piste : un pas au-dessus de la surface, jamais un contour. */}
                <div className="absolute inset-0 rounded-pill" style={{ backgroundColor: theme.track }} />
                <div
                  className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-out group-hover:brightness-95"
                  style={{
                    width: ready ? `${Math.max(ratio * 100, item.value > 0 ? 2 : 0)}%` : '0%',
                    backgroundColor: dimmed ? theme.muted : theme.series,
                    borderRadius: 9999,
                    transitionDelay: `${index * 40}ms`,
                  }}
                  aria-hidden="true"
                />
              </div>

              {/* Valeur à la pointe, en encre de texte — jamais en couleur de série. */}
              <div className="w-20 shrink-0 text-right leading-tight">
                <span className="tabular block text-sm font-bold text-ink dark:text-white">
                  {item.display ?? item.value.toLocaleString('fr-FR')}
                </span>
                {item.secondary && (
                  <span className="tabular block text-[11px] text-ink-muted">{item.secondary}</span>
                )}
              </div>
            </Wrapper>
          </li>
        );
      })}
    </ul>
  );
}
