import { cn } from '@/utils/cn';
import { humanizeEnum } from '@/utils/format';
import type {
  BuildingPermitStatus,
  ProjectStatus,
  PropertyStatus,
  ShareStatus,
} from '@/types/domain';

type Tone = 'slate' | 'amber' | 'green' | 'blue' | 'red' | 'violet' | 'zinc';

const TONES: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  green: 'bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-400',
  blue: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300',
  violet: 'bg-accent-100 text-accent-700 dark:bg-accent-500/20 dark:text-accent-400',
  zinc: 'bg-ink text-white dark:bg-white/20 dark:text-white',
};

/**
 * Couleurs de statut, identiques d'un écran à l'autre (§34).
 *
 * La même teinte désigne le même état en liste, en fiche et sur la carte :
 * l'utilisateur apprend le code couleur une seule fois.
 */
const PROPERTY_TONES: Record<PropertyStatus, Tone> = {
  NON_AMENAGE: 'slate',
  EN_AMENAGEMENT: 'amber',
  AMENAGE: 'green',
  EN_PROJET: 'blue',
  EN_LITIGE: 'red',
  VENDU: 'zinc',
  TRANSFERE: 'zinc',
  AUTRE: 'slate',
};

const PROJECT_TONES: Record<ProjectStatus, Tone> = {
  IDEE: 'slate',
  ETUDE_PRELIMINAIRE: 'slate',
  EN_ETUDE: 'blue',
  CONCEPTION: 'blue',
  EN_ATTENTE_PERMIS: 'amber',
  PERMIS_OBTENU: 'violet',
  TRAVAUX_PREPARATION: 'amber',
  TRAVAUX_EN_COURS: 'amber',
  SUSPENDU: 'red',
  TERMINE: 'green',
  ABANDONNE: 'zinc',
};

const SHARE_TONES: Record<ShareStatus, Tone> = {
  PENDING: 'amber',
  ACTIVE: 'green',
  EXPIRED: 'slate',
  REVOKED: 'red',
};

const PERMIT_TONES: Record<BuildingPermitStatus, Tone> = {
  EN_ATTENTE: 'slate',
  EN_ETUDE: 'blue',
  APPROUVE: 'green',
  REFUSE: 'red',
  EXPIRE: 'amber',
  ANNULE: 'zinc',
};

export type BadgeKind = 'property' | 'project' | 'share' | 'permit' | 'neutral';

const REGISTRY: Record<BadgeKind, Record<string, Tone>> = {
  property: PROPERTY_TONES,
  project: PROJECT_TONES,
  share: SHARE_TONES,
  permit: PERMIT_TONES,
  neutral: {},
};

interface StatusBadgeProps {
  status: string;
  kind?: BadgeKind;
  className?: string;
}

export function StatusBadge({
  status,
  kind = 'neutral',
  className,
}: StatusBadgeProps) {
  const tone = REGISTRY[kind][status] ?? 'slate';

  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-pill px-2.5 py-0.5',
        'text-xs font-semibold',
        TONES[tone],
        className,
      )}
    >
      {humanizeEnum(status)}
    </span>
  );
}

/**
 * Pastille de variation : flèche + pourcentage sur fond plein, verte quand la
 * direction est favorable, orange sinon — le code du design de référence.
 */
export function DeltaPill({
  value,
  good,
  className,
}: {
  value: string;
  good: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex flex-col items-center gap-0.5', className)}>
      <span
        className={cn('text-sm leading-none', good ? 'text-success-600' : 'text-brand-500')}
        aria-hidden="true"
      >
        {good ? '↑' : '↓'}
      </span>
      <span
        className={cn(
          'rounded-pill px-2.5 py-1 text-[11px] font-semibold leading-none text-white',
          good ? 'bg-success-500' : 'bg-brand-400',
        )}
      >
        {value}
      </span>
    </span>
  );
}

/** Couleur du marker cartographique, alignée sur le badge (§11). */
export function propertyStatusColor(status: PropertyStatus): string {
  const colors: Record<Tone, string> = {
    slate: '#64748b',
    amber: '#d97706',
    green: '#059669',
    blue: '#0284c7',
    red: '#dc2626',
    violet: '#7c3aed',
    zinc: '#3f3f46',
  };

  return colors[PROPERTY_TONES[status] ?? 'slate'];
}
