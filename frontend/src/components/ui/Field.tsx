import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/utils/cn';
import { Icon } from './Icon';

/**
 * Base commune des contrôles : pilule, hauteur 48 px, bordure fine.
 * Les zones de texte gardent un rayon plus modeste — une pilule sur plusieurs
 * lignes se lit mal.
 */
const CONTROL_BASE =
  'block w-full border bg-white px-4 text-sm text-ink placeholder:text-ink-muted ' +
  'transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ' +
  'disabled:bg-slate-50 disabled:text-ink-muted ' +
  'dark:border-white/15 dark:bg-night-600 dark:text-white dark:placeholder:text-slate-500 ' +
  'dark:disabled:bg-night-700';

interface FieldWrapperProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}

export function FieldWrapper({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
  className,
}: FieldWrapperProps) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </label>
      )}
      <div className={label ? 'mt-1.5' : undefined}>{children}</div>
      {/* L'erreur remplace l'aide : afficher les deux brouille le message. */}
      {error ? <p className="error-text">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, wrapperClassName, className, id, required, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <FieldWrapper
        label={label}
        hint={hint}
        error={error}
        required={required}
        htmlFor={inputId}
        className={wrapperClassName}
      >
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            CONTROL_BASE,
            'h-12 rounded-pill',
            error ? 'border-red-400' : 'border-slate-300',
            className,
          )}
          {...props}
        />
      </FieldWrapper>
    );
  },
);
Input.displayName = 'Input';

export interface PasswordInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}

/**
 * Champ de mot de passe avec bascule de visibilité.
 *
 * Permet de relire ce qu'on saisit — utile sur un mot de passe long ou sur
 * mobile — sans renoncer au masquage par défaut. La bascule revient à `password`
 * à chaque montage : l'état ne doit pas survivre d'un écran à l'autre.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ label, hint, error, wrapperClassName, className, id, required, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <FieldWrapper
        label={label}
        hint={hint}
        error={error}
        required={required}
        htmlFor={inputId}
        className={wrapperClassName}
      >
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={visible ? 'text' : 'password'}
            aria-invalid={error ? true : undefined}
            className={cn(
              CONTROL_BASE,
              // Réserve la place du bouton pour que le texte ne passe pas
              // dessous sur un mot de passe long.
              'h-12 rounded-pill pr-12',
              error ? 'border-red-400' : 'border-slate-300',
              className,
            )}
            {...props}
          />

          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            // `tabIndex={-1}` : la tabulation doit mener au bouton de
            // validation, pas à cette commande d'affichage.
            tabIndex={-1}
            aria-label={
              visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
            }
            aria-pressed={visible}
            title={visible ? 'Masquer' : 'Afficher'}
            className={cn(
              'absolute right-1 top-1 flex h-10 w-10 items-center justify-center',
              'rounded-full text-ink-muted transition-colors',
              'hover:bg-slate-100 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
            disabled={props.disabled}
          >
            <Icon name={visible ? 'eyeOff' : 'eye'} className="h-[18px] w-[18px]" />
          </button>
        </div>
      </FieldWrapper>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      hint,
      error,
      wrapperClassName,
      className,
      id,
      required,
      options,
      placeholder,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;

    return (
      <FieldWrapper
        label={label}
        hint={hint}
        error={error}
        required={required}
        htmlFor={selectId}
        className={wrapperClassName}
      >
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          className={cn(
            CONTROL_BASE,
            'h-12 rounded-pill pr-10',
            error ? 'border-red-400' : 'border-slate-300',
            className,
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FieldWrapper>
    );
  },
);
Select.displayName = 'Select';

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, wrapperClassName, className, id, required, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id ?? generatedId;

    return (
      <FieldWrapper
        label={label}
        hint={hint}
        error={error}
        required={required}
        htmlFor={textareaId}
        className={wrapperClassName}
      >
        <textarea
          ref={ref}
          id={textareaId}
          rows={props.rows ?? 4}
          aria-invalid={error ? true : undefined}
          className={cn(
            CONTROL_BASE,
            'rounded-2xl py-3',
            error ? 'border-red-400' : 'border-slate-300',
            className,
          )}
          {...props}
        />
      </FieldWrapper>
    );
  },
);
Textarea.displayName = 'Textarea';
