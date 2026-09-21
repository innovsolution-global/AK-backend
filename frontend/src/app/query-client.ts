import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Réessayer une 4xx est inutile : la requête est en cause, pas le
        // réseau. Un 401 est déjà traité par l'intercepteur HTTP.
        if (error instanceof ApiError && error.isClientError) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

/** Clés de cache normalisées : une seule source de vérité pour les invalidations. */
export const queryKeys = {
  auth: { me: ['auth', 'me'] as const },

  properties: {
    all: ['properties'] as const,
    lists: () => [...queryKeys.properties.all, 'list'] as const,
    list: (filters: unknown) => [...queryKeys.properties.lists(), filters] as const,
    detail: (id: string) => [...queryKeys.properties.all, 'detail', id] as const,
    documents: (id: string) => [...queryKeys.properties.all, id, 'documents'] as const,
    geoFiles: (id: string) => [...queryKeys.properties.all, id, 'geo'] as const,
    shares: (id: string) => [...queryKeys.properties.all, id, 'shares'] as const,
    history: (id: string) => [...queryKeys.properties.all, id, 'history'] as const,
  },

  projects: {
    all: ['projects'] as const,
    lists: () => [...queryKeys.projects.all, 'list'] as const,
    list: (filters: unknown) => [...queryKeys.projects.lists(), filters] as const,
    detail: (id: string) => [...queryKeys.projects.all, 'detail', id] as const,
    history: (id: string) => [...queryKeys.projects.all, id, 'history'] as const,
  },

  locations: {
    all: ['locations'] as const,
    list: (filters: unknown) => [...queryKeys.locations.all, 'list', filters] as const,
    sites: (id: string) => [...queryKeys.locations.all, id, 'sites'] as const,
  },

  sites: {
    all: ['sites'] as const,
    list: (filters: unknown) => [...queryKeys.sites.all, 'list', filters] as const,
  },

  companies: {
    all: ['companies'] as const,
    list: (filters: unknown) => [...queryKeys.companies.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.companies.all, 'detail', id] as const,
  },

  users: {
    all: ['users'] as const,
    list: (filters: unknown) => [...queryKeys.users.all, 'list', filters] as const,
  },

  shares: {
    all: ['shares'] as const,
    list: (filters: unknown) => [...queryKeys.shares.all, 'list', filters] as const,
  },

  map: {
    all: ['map'] as const,
    markers: (filters: unknown) => [...queryKeys.map.all, 'markers', filters] as const,
  },

  dashboard: {
    all: ['dashboard'] as const,
    overview: () => [...queryKeys.dashboard.all, 'overview'] as const,
    properties: () => [...queryKeys.dashboard.all, 'properties'] as const,
    projects: () => [...queryKeys.dashboard.all, 'projects'] as const,
    documents: () => [...queryKeys.dashboard.all, 'documents'] as const,
    acquisitions: (months: number) =>
      [...queryKeys.dashboard.all, 'acquisitions', months] as const,
    activity: () => [...queryKeys.dashboard.all, 'activity'] as const,
  },

  notifications: {
    all: ['notifications'] as const,
    list: (filters: unknown) => [...queryKeys.notifications.all, 'list', filters] as const,
    unreadCount: () => [...queryKeys.notifications.all, 'unread-count'] as const,
  },

  audit: {
    all: ['audit'] as const,
    list: (filters: unknown) => [...queryKeys.audit.all, 'list', filters] as const,
  },

  search: (term: string) => ['search', term] as const,

  shared: {
    all: ['shared'] as const,
    properties: () => [...queryKeys.shared.all, 'properties'] as const,
    property: (id: string) => [...queryKeys.shared.all, 'property', id] as const,
    documents: (id: string) => [...queryKeys.shared.all, id, 'documents'] as const,
  },
};
