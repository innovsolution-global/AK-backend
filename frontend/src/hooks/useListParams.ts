import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface ListParams {
  page: number;
  limit: number;
  sort?: string;
  order: 'asc' | 'desc';
  search?: string;
  [key: string]: string | number | undefined;
}

/**
 * Synchronise les filtres d'une liste avec l'URL.
 *
 * Une vue filtrée devient ainsi partageable et survit au rafraîchissement ; le
 * bouton « retour » du navigateur reprend son sens naturel.
 */
export function useListParams(defaults: Partial<ListParams> = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo<ListParams>(() => {
    const raw: ListParams = {
      page: Number(searchParams.get('page') ?? defaults.page ?? 1),
      limit: Number(searchParams.get('limit') ?? defaults.limit ?? 20),
      order: (searchParams.get('order') ?? defaults.order ?? 'desc') as 'asc' | 'desc',
    };

    const sort = searchParams.get('sort') ?? defaults.sort;
    if (sort) raw.sort = sort;

    const search = searchParams.get('search') ?? undefined;
    if (search) raw.search = search;

    for (const [key, value] of searchParams.entries()) {
      if (!['page', 'limit', 'sort', 'order', 'search'].includes(key) && value) {
        raw[key] = value;
      }
    }

    return raw;
  }, [searchParams, defaults.page, defaults.limit, defaults.order, defaults.sort]);

  const update = useCallback(
    (changes: Record<string, string | number | undefined>, resetPage = true) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);

          for (const [key, value] of Object.entries(changes)) {
            if (value === undefined || value === '') {
              next.delete(key);
            } else {
              next.set(key, String(value));
            }
          }

          // Changer un filtre en restant page 4 afficherait souvent un écran
          // vide : on revient au début du jeu de résultats.
          if (resetPage && !('page' in changes)) {
            next.delete('page');
          }

          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPage = useCallback(
    (page: number) => update({ page }, false),
    [update],
  );

  const toggleSort = useCallback(
    (field: string) => {
      const isSame = params.sort === field;
      update({
        sort: field,
        order: isSame && params.order === 'desc' ? 'asc' : 'desc',
      });
    },
    [params.sort, params.order, update],
  );

  const reset = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  const hasFilters = useMemo(
    () =>
      [...searchParams.keys()].some(
        (key) => !['page', 'limit', 'sort', 'order'].includes(key),
      ),
    [searchParams],
  );

  return { params, update, setPage, toggleSort, reset, hasFilters };
}
