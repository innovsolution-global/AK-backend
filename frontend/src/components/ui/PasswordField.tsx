import { useMemo } from 'react';
import { PasswordInput, type PasswordInputProps } from './Field';
import { cn } from '@/utils/cn';

export const PASSWORD_MIN_LENGTH = 12;

export interface PasswordRule {
  label: string;
  satisfied: boolean;
}

/** Règles reflétant exactement la politique du backend (§8). */
export function checkPassword(value: string): PasswordRule[] {
  return [
    {
      label: `Au moins ${PASSWORD_MIN_LENGTH} caractères`,
      satisfied: value.length >= PASSWORD_MIN_LENGTH,
    },
    { label: 'Une minuscule', satisfied: /[a-z]/.test(value) },
    { label: 'Une majuscule', satisfied: /[A-Z]/.test(value) },
    { label: 'Un chiffre', satisfied: /\d/.test(value) },
  ];
}

export function isPasswordValid(value: string): boolean {
  return checkPassword(value).every((rule) => rule.satisfied);
}

interface PasswordFieldProps extends PasswordInputProps {
  /** Affiche la liste des règles sous le champ. */
  showRules?: boolean;
}

/**
 * Champ de mot de passe avec les règles affichées en direct.
 *
 * Montrer les contraintes pendant la saisie évite le va-et-vient d'un refus
 * après envoi.
 */
export function PasswordField({
  showRules = false,
  value,
  ...props
}: PasswordFieldProps) {
  const rules = useMemo(() => checkPassword(String(value ?? '')), [value]);
  const touched = String(value ?? '').length > 0;

  return (
    <div>
      <PasswordInput value={value} autoComplete="new-password" {...props} />

      {showRules && touched && (
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {rules.map((rule) => (
            <li
              key={rule.label}
              className={cn(
                'flex items-center gap-1.5 text-xs',
                rule.satisfied ? 'text-emerald-700' : 'text-slate-500',
              )}
            >
              <span
                className={cn(
                  'flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white',
                  rule.satisfied ? 'bg-emerald-600' : 'bg-slate-300',
                )}
                aria-hidden="true"
              >
                ✓
              </span>
              {rule.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
