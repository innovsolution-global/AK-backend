import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Fusionne des classes Tailwind en résolvant les conflits.
 *
 * `clsx` gère les conditions, `twMerge` fait gagner la dernière classe d'un
 * même groupe : sans lui, `px-2 px-4` laisserait l'ordre du CSS décider.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
