import type { ReactNode } from 'react';
import { CountUp } from '@/components/motion';
import { Icon, type IconName } from '@/components/ui/Icon';
import { DeltaPill } from '@/components/ui/StatusBadge';
import { cn } from '@/utils/cn';

interface KpiCardProps {
  icon: IconName;
  label: string;
  value: number;
  /** Suffixe collé au chiffre (« k », « ha »). */
  unit?: string;
  decimals?: number;
  /** Variation affichée à droite : flèche + pastille pleine. */
  delta?: { value: string; good: boolean };
  /** Texte discret sous la valeur, quand il n'y a pas de variation. */
  hint?: string;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
  /** Compacte les grands nombres (1 284 → 1,3k). */
  compact?: boolean;
  children?: ReactNode;
}

/**
 * Tuile indicateur du design de référence : disque d'icône à gauche, libellé
 * gris puis très grand chiffre, variation en pastille à droite.
 */
export function KpiCard({
  icon,
  label,
  value,
  unit,
  decimals = 0,
  delta,
  hint,
  loading,
  onClick,
  className,
  compact = false,
  children,
}: KpiCardProps) {
  const Wrapper = onClick ? 'button' : 'div';

  const format = (n: number) => {
    if (compact && n >= 10_000) {
      return `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}k`;
    }
    return n.toLocaleString('fr-FR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'card flex w-full items-center gap-5 p-5 text-left transition-all duration-200',
        onClick && 'hover:-translate-y-0.5 hover:shadow-card-hover',
        className,
      )}
    >
      <div className="icon-disc h-[76px] w-[76px]">
        <Icon name={icon} className="h-8 w-8" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-ink-muted">{label}</p>
        {loading ? (
          <div className="shimmer mt-2 h-10 w-28 rounded-xl" />
        ) : (
          <p className="mt-0.5 text-[2.6rem] font-extrabold leading-none tracking-tight text-ink dark:text-white">
            <CountUp value={value} format={format} />
            {unit && <span className="ml-1 text-xl font-bold text-ink-muted">{unit}</span>}
          </p>
        )}
        {hint && !delta && <p className="mt-1.5 truncate text-xs font-medium text-ink-muted">{hint}</p>}
        {children}
      </div>

      {delta && !loading && <DeltaPill value={delta.value} good={delta.good} />}
    </Wrapper>
  );
}
