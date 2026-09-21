import { motion, useReducedMotion } from 'framer-motion';
import { useTheme } from './ThemeProvider';
import { cn } from '@/utils/cn';

/**
 * Bascule clair/sombre : un soleil qui glisse vers la lune.
 *
 * Un `switch` accessible plutôt qu'un bouton d'icône : l'état courant est
 * annoncé aux lecteurs d'écran et la sémantique correspond à ce que fait le
 * contrôle.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { isDark, toggle } = useTheme();
  const reduced = useReducedMotion();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Passer au thème clair' : 'Passer au thème sombre'}
      onClick={toggle}
      className={cn(
        'relative flex h-9 w-16 shrink-0 items-center rounded-pill p-1 transition-colors duration-300',
        isDark
          ? 'bg-gradient-to-r from-night-600 to-night-500'
          : 'bg-gradient-to-r from-sky-300 to-sky-200',
        className,
      )}
    >
      {/* Décor : étoiles sur le ciel nocturne, nuage sur le ciel de jour. */}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 rounded-pill transition-opacity duration-300',
          isDark ? 'opacity-100' : 'opacity-0',
        )}
      >
        <span className="absolute left-3 top-2 h-0.5 w-0.5 rounded-full bg-white/80" />
        <span className="absolute left-5 top-5 h-1 w-1 rounded-full bg-white/70" />
        <span className="absolute left-8 top-3 h-0.5 w-0.5 rounded-full bg-white/60" />
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute right-3 top-1/2 h-3 w-6 -translate-y-1/2 rounded-pill bg-white/70 transition-opacity duration-300',
          isDark ? 'opacity-0' : 'opacity-100',
        )}
      />

      <motion.span
        layout
        transition={
          reduced ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 32 }
        }
        className={cn(
          'relative z-10 flex h-7 w-7 items-center justify-center rounded-full shadow-md',
          isDark ? 'ml-auto bg-slate-200' : 'bg-gradient-to-br from-yellow-300 to-amber-400',
        )}
      >
        {isDark ? (
          <span className="relative block h-full w-full rounded-full">
            <span className="absolute left-2 top-2 h-1.5 w-1.5 rounded-full bg-slate-400/70" />
            <span className="absolute left-4 top-3.5 h-1 w-1 rounded-full bg-slate-400/60" />
          </span>
        ) : null}
      </motion.span>
    </button>
  );
}
