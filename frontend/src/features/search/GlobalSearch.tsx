import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { searchApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { Icon } from '@/components/ui/Icon';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/utils/cn';
import type { SearchHit } from '@/types/domain';

const ENTITY_LABELS: Record<SearchHit['entity'], string> = {
  property: 'Terrain',
  project: 'Projet',
  site: 'Site',
  location: 'Ville',
  document: 'Document',
  company: 'Entreprise',
};

export function GlobalSearch() {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(term, 250);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.search(debounced),
    queryFn: () => searchApi.find(debounced),
    enabled: debounced.trim().length >= 2,
    staleTime: 15_000,
  });

  // ⌘K / Ctrl+K place le curseur dans la recherche, Échap la referme.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Un clic hors du panneau le referme.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const select = (hit: SearchHit) => {
    setOpen(false);
    setTerm('');
    navigate(hit.path);
  };

  const results = data?.results ?? [];
  const showPanel = open && debounced.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted"
        />
        <input
          ref={inputRef}
          type="search"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Rechercher"
          aria-label="Recherche globale"
          className={cn(
            'pill-outline h-12 w-full pl-13 pr-16 text-sm placeholder:text-ink-muted',
            'focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
          )}
          style={{ paddingLeft: '3.25rem' }}
        />
        <kbd className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted dark:border-white/15 sm:block">
          ⌘K
        </kbd>
      </div>

      {showPanel && (
        <div className="card absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-y-auto py-2 shadow-card-hover animate-fade-up">
          {isFetching && results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">Recherche…</p>
          )}

          {!isFetching && results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">
              Aucun résultat pour « {debounced} »
            </p>
          )}

          {results.map((hit) => (
            <button
              key={`${hit.entity}-${hit.id}`}
              type="button"
              onClick={() => select(hit)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
            >
              <span className="w-20 shrink-0 rounded-pill bg-slate-100 px-2 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-muted dark:bg-white/10">
                {ENTITY_LABELS[hit.entity]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink dark:text-white">
                  {hit.title}
                </span>
                {hit.subtitle && (
                  <span className="block truncate text-xs text-ink-muted">{hit.subtitle}</span>
                )}
              </span>
              <Icon name="chevronRight" className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
