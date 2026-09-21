import { useEffect, useState } from 'react';

/**
 * Retarde la propagation d'une valeur.
 *
 * Utilisé sur les champs de recherche : sans cela, chaque frappe déclencherait
 * une requête.
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
