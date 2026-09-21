import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

type Variant = 'primary' | 'success' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

/**
 * Deux actions colorées portent un halo : l'orange de marque et le vert
 * d'action. Le halo est la signature du design, réservé aux actions
 * principales pour qu'il garde son sens.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-brand text-white shadow-glow-brand hover:brightness-105 disabled:opacity-60 disabled:shadow-none',
  success:
    'bg-gradient-success text-white shadow-glow-success hover:brightness-105 disabled:opacity-60 disabled:shadow-none',
  secondary:
    'pill-outline hover:bg-slate-50 disabled:text-ink-muted dark:hover:bg-white/5',
  ghost:
    'text-ink-soft hover:bg-slate-100 hover:text-ink dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white',
  danger:
    'bg-red-600 text-white shadow-[0_10px_30px_-8px_rgb(220_38_38/0.55)] hover:bg-red-700 disabled:opacity-60 disabled:shadow-none',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconRight,
      className,
      children,
      disabled,
      type = 'button',
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-pill font-semibold transition-all duration-200',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  ),
);

Button.displayName = 'Button';

/** Bouton rond à icône seule — cloche, chevrons de repli, pagination. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'sm' | 'md' | 'lg'; active?: boolean }
>(({ className, size = 'md', active, type = 'button', ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(
      'inline-flex shrink-0 items-center justify-center rounded-full border transition-colors',
      size === 'sm' && 'h-9 w-9',
      size === 'md' && 'h-11 w-11',
      size === 'lg' && 'h-12 w-12',
      active
        ? 'border-transparent bg-gradient-brand text-white shadow-glow-brand'
        : 'border-slate-300 bg-white text-ink hover:bg-slate-50 dark:border-white/15 dark:bg-transparent dark:text-white dark:hover:bg-white/5',
      'disabled:cursor-not-allowed disabled:opacity-40',
      className,
    )}
    {...props}
  />
));

IconButton.displayName = 'IconButton';

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
