import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useReducedMotion,
  type Variants,
} from 'framer-motion';
import { useLocation } from 'react-router-dom';

/**
 * Primitives d'animation.
 *
 * Toutes respectent `prefers-reduced-motion` : les personnes sensibles aux
 * mouvements voient les mêmes contenus, sans déplacement ni fondu prolongé.
 * Les durées restent courtes (≤ 400 ms) — l'animation signale un changement,
 * elle ne doit jamais faire attendre.
 */

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: EASE_OUT },
  },
};

const fadeUpReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
};

/** Conteneur qui fait apparaître ses enfants `<FadeIn>` les uns après les autres. */
export function Stagger({
  children,
  delay = 0,
  step = 0.06,
  className,
}: {
  children: ReactNode;
  delay?: number;
  step?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: { delayChildren: delay, staggerChildren: reduced ? 0 : step },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

/** Élément qui glisse et apparaît ; s'enchaîne dans un `<Stagger>` ou seul. */
export function FadeIn({
  children,
  className,
  delay,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const variants = reduced ? fadeUpReduced : fadeUp;

  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      animate="visible"
      transition={delay !== undefined ? { delay } : undefined}
    >
      {children}
    </motion.div>
  );
}

/**
 * Transition entre pages : l'écran sortant se fond, l'entrant glisse en place.
 * `mode="wait"` évite que les deux coexistent et fassent sauter la mise en page.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  const reduced = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
        transition={{ duration: reduced ? 0.12 : 0.22, ease: EASE_OUT }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Nombre qui compte jusqu'à sa valeur.
 *
 * Utilisé sur les indicateurs clés : le mouvement attire l'œil sur le chiffre
 * qui vient de se charger. Sans mouvement réduit : la valeur s'affiche d'un coup.
 */
export function CountUp({
  value,
  duration = 0.9,
  format = (n: number) => Math.round(n).toLocaleString('fr-FR'),
  className,
}: {
  value: number;
  duration?: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(() => format(reduced ? value : 0));
  const previous = useRef(0);

  useEffect(() => {
    if (reduced) {
      setDisplay(format(value));
      previous.current = value;
      return;
    }

    const controls = animate(previous.current, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: (latest) => setDisplay(format(latest)),
    });

    previous.current = value;
    return () => controls.stop();
  }, [value, duration, format, reduced]);

  return <span className={className}>{display}</span>;
}

/** Léger soulèvement au survol — pour les cartes cliquables. */
export function Lift({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={className}
      whileHover={reduced ? undefined : { y: -2 }}
      transition={{ duration: 0.18, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

export { AnimatePresence, motion };
