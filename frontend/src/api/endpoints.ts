import { http } from './http';
import type { ApiResponse, PaginatedResponse } from './types';
import type {
  AcquisitionPoint,
  AppUser,
  AppliedCoordinates,
  AuditEntry,
  Company,
  DashboardActivity,
  DashboardDocuments,
  DashboardOverview,
  DashboardProjects,
  DashboardProperties,
  GeoFile,
  GuineaReference,
  LocationRef,
  MapMarker,
  Notification,
  ParcelCollection,
  ProjectDetail,
  ProjectListItem,
  PropertyDetail,
  PropertyDocument,
  PropertyListItem,
  PropertyShare,
  SearchHit,
  SharedPropertyView,
  StatusHistoryEntry,
} from '@/types/domain';

/** Retire les filtres vides pour ne pas polluer l'URL ni la clé de cache. */
function clean(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  );
}

async function getList<T>(
  url: string,
  params: Record<string, unknown> = {},
): Promise<PaginatedResponse<T>> {
  const { data } = await http.get<PaginatedResponse<T>>(url, {
    params: clean(params),
  });
  return data;
}

async function getOne<T>(
  url: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const { data } = await http.get<ApiResponse<T>>(url, { params: clean(params) });
  return data.data;
}

// --- Terrains ---------------------------------------------------------------

export const propertiesApi = {
  list: (params: Record<string, unknown>) =>
    getList<PropertyListItem>('/properties', params),
  detail: (id: string) => getOne<PropertyDetail>(`/properties/${id}`),
  create: (payload: unknown) =>
    http.post<ApiResponse<PropertyDetail>>('/properties', payload).then((r) => r.data.data),
  update: (id: string, payload: unknown) =>
    http.patch<ApiResponse<PropertyDetail>>(`/properties/${id}`, payload).then((r) => r.data.data),
  remove: (id: string) => http.delete(`/properties/${id}`).then(() => undefined),
  replaceCoordinates: (id: string, coordinates: unknown[]) =>
    http.put(`/properties/${id}/coordinates`, { coordinates }).then(() => undefined),
  history: (id: string) => getOne<AuditEntry[]>(`/properties/${id}/history`),
  documents: (id: string, params: Record<string, unknown> = {}) =>
    getList<PropertyDocument>(`/properties/${id}/documents`, params),
  geoFiles: (id: string) => getOne<GeoFile[]>(`/properties/${id}/google-earth`),
  shares: (id: string) => getOne<PropertyShare[]>(`/properties/${id}/shares`),
};

export const documentsApi = {
  download: (id: string, inline = false) =>
    getOne<{ url: string; expiresIn: number; fileName: string }>(
      `/documents/${id}/download`,
      { inline },
    ),
  versions: (id: string) => getOne<PropertyDocument[]>(`/documents/${id}/versions`),
  remove: (id: string) => http.delete(`/documents/${id}`).then(() => undefined),

  /** Le navigateur pose lui-même la frontière multipart : ne pas la forcer. */
  upload: (propertyId: string, file: File, name: string, type: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('name', name);
    form.append('type', type);

    return http
      .post<ApiResponse<PropertyDocument>>(
        `/properties/${propertyId}/documents`,
        form,
        { headers: { 'Content-Type': undefined } },
      )
      .then((r) => r.data.data);
  },

  uploadVersion: (documentId: string, file: File, name?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (name) form.append('name', name);

    return http
      .post<ApiResponse<PropertyDocument>>(`/documents/${documentId}/versions`, form, {
        headers: { 'Content-Type': undefined },
      })
      .then((r) => r.data.data);
  },
};

export const googleEarthApi = {
  upload: (propertyId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);

    return http
      .post<ApiResponse<GeoFile>>(`/properties/${propertyId}/google-earth`, form, {
        headers: { 'Content-Type': undefined },
      })
      .then((r) => r.data.data);
  },
  geometry: (propertyId: string, fileId: string) =>
    getOne<{ extractedGeometry: unknown; bounds: unknown }>(
      `/properties/${propertyId}/google-earth/${fileId}/geometry`,
    ),
  download: (propertyId: string, fileId: string) =>
    getOne<{ url: string; fileName: string }>(
      `/properties/${propertyId}/google-earth/${fileId}/download`,
    ),
  remove: (propertyId: string, fileId: string) =>
    http.delete(`/properties/${propertyId}/google-earth/${fileId}`).then(() => undefined),
  /**
   * KML généré du terrain. La réponse est le fichier lui-même (pas une
   * enveloppe JSON) : on le récupère en blob pour déclencher le téléchargement
   * avec le jeton d'accès, qu'un simple lien <a> ne pourrait pas porter.
   */
  exportKml: (propertyId: string) =>
    http
      .get<Blob>(`/properties/${propertyId}/google-earth/export.kml`, {
        responseType: 'blob',
      })
      .then((r) => ({
        blob: r.data,
        fileName: fileNameFrom(r.headers['content-disposition']) ?? 'terrain.kml',
      })),
  applyCoordinates: (propertyId: string, fileId: string) =>
    http
      .post<ApiResponse<AppliedCoordinates>>(
        `/properties/${propertyId}/google-earth/${fileId}/apply-coordinates`,
      )
      .then((r) => r.data.data),
};

function fileNameFrom(disposition: unknown): string | null {
  if (typeof disposition !== 'string') return null;
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match?.[1] ?? null;
}

// --- Projets ----------------------------------------------------------------

export const projectsApi = {
  list: (params: Record<string, unknown>) =>
    getList<ProjectListItem>('/projects', params),
  detail: (id: string) => getOne<ProjectDetail>(`/projects/${id}`),
  create: (payload: unknown) =>
    http.post<ApiResponse<ProjectDetail>>('/projects', payload).then((r) => r.data.data),
  update: (id: string, payload: unknown) =>
    http.patch<ApiResponse<ProjectDetail>>(`/projects/${id}`, payload).then((r) => r.data.data),
  remove: (id: string) => http.delete(`/projects/${id}`).then(() => undefined),
  changeStatus: (id: string, status: string, comment?: string) =>
    http
      .post<ApiResponse<ProjectDetail>>(`/projects/${id}/status`, { status, comment })
      .then((r) => r.data.data),
  statusHistory: (id: string) =>
    getOne<StatusHistoryEntry[]>(`/projects/${id}/status-history`),
  addComponent: (id: string, payload: unknown) =>
    http.post(`/projects/${id}/components`, payload).then(() => undefined),
  removeComponent: (id: string, componentId: string) =>
    http.delete(`/projects/${id}/components/${componentId}`).then(() => undefined),
  addPermit: (id: string, payload: unknown) =>
    http.post(`/projects/${id}/permits`, payload).then(() => undefined),
};

// --- Référentiels -----------------------------------------------------------

type LocationOption = LocationRef & {
  type: string;
  _count: { sites: number; properties: number };
};

export const locationsApi = {
  list: (params: Record<string, unknown>) =>
    getList<LocationRef & { type: string; _count: { sites: number; properties: number } }>(
      '/locations',
      params,
    ),
  sites: (id: string) => getOne<Array<LocationRef & { description: string | null }>>(
    `/locations/${id}/sites`,
  ),
  /**
   * Toutes les localités, pour les listes déroulantes.
   *
   * La pagination de l'API plafonne à 100 éléments par page : on enchaîne les
   * pages plutôt que de demander une limite que le backend refuserait — le
   * découpage guinéen en compte déjà 46, et les communes s'ajoutent.
   */
  all: async () => {
    const first = await getList<LocationOption>('/locations', {
      limit: 100,
      sort: 'name',
      order: 'asc',
    });

    const pages: LocationOption[] = [...first.data];
    for (let page = 2; page <= first.meta.totalPages; page += 1) {
      const next = await getList<LocationOption>('/locations', {
        limit: 100,
        page,
        sort: 'name',
        order: 'asc',
      });
      pages.push(...next.data);
    }
    return pages;
  },
  /** Découpage administratif officiel + état de la base (§6). */
  reference: () => getOne<GuineaReference>('/locations/reference'),
  importReference: () =>
    http
      .post<ApiResponse<{ created: number; skipped: number; createdNames: string[] }>>(
        '/locations/import-reference',
      )
      .then((r) => r.data.data),
  create: (payload: unknown) => http.post('/locations', payload).then(() => undefined),
  update: (id: string, payload: unknown) =>
    http.patch(`/locations/${id}`, payload).then(() => undefined),
  remove: (id: string) => http.delete(`/locations/${id}`).then(() => undefined),
};

export const sitesApi = {
  list: (params: Record<string, unknown>) =>
    getList<
      LocationRef & {
        location: LocationRef;
        _count: { properties: number; projects: number };
      }
    >('/sites', params),
  create: (payload: unknown) => http.post('/sites', payload).then(() => undefined),
  update: (id: string, payload: unknown) =>
    http.patch(`/sites/${id}`, payload).then(() => undefined),
  remove: (id: string) => http.delete(`/sites/${id}`).then(() => undefined),
};

export const companiesApi = {
  list: (params: Record<string, unknown>) => getList<Company>('/companies', params),
  detail: (id: string) => getOne<Company>(`/companies/${id}`),
  create: (payload: unknown) => http.post('/companies', payload).then(() => undefined),
  update: (id: string, payload: unknown) =>
    http.patch(`/companies/${id}`, payload).then(() => undefined),
  remove: (id: string) => http.delete(`/companies/${id}`).then(() => undefined),
};

// --- Partages ---------------------------------------------------------------

export const sharesApi = {
  list: (params: Record<string, unknown>) => getList<PropertyShare>('/shares', params),
  create: (propertyId: string, payload: unknown) =>
    http
      .post<ApiResponse<PropertyShare & { invitationSent: boolean }>>(
        `/properties/${propertyId}/share`,
        payload,
      )
      .then((r) => r.data.data),
  revoke: (propertyId: string, shareId: string) =>
    http.delete(`/properties/${propertyId}/shares/${shareId}`).then(() => undefined),
  resend: (propertyId: string, shareId: string) =>
    http.post(`/properties/${propertyId}/shares/${shareId}/resend`).then(() => undefined),
  validateToken: (token: string) =>
    getOne<{
      valid: boolean;
      propertyReference?: string;
      beneficiaryFirstName?: string;
      expiresAt?: string;
    }>(`/shares/validate/${encodeURIComponent(token)}`),
  activate: (token: string, password: string) =>
    http
      .post<ApiResponse<{ activated: boolean; email: string; propertyReference: string }>>(
        '/shares/activate',
        { token, password },
      )
      .then((r) => r.data.data),
};

// --- Espace bénéficiaire ----------------------------------------------------

export const sharedApi = {
  properties: () =>
    getOne<
      Array<{
        id: string;
        reference: string;
        name: string;
        location: { name: string };
        site: { name: string } | null;
        status: string;
        expiresAt: string;
      }>
    >('/shared/properties'),
  property: (id: string) => getOne<SharedPropertyView>(`/shared/properties/${id}`),
  documents: (id: string) =>
    getOne<
      Array<{
        id: string;
        name: string;
        type: string;
        fileName: string;
        size: number;
        createdAt: string;
      }>
    >(`/shared/properties/${id}/documents`),
  downloadDocument: (id: string) =>
    getOne<{ url: string; fileName: string }>(`/shared/documents/${id}/download`),
  downloadGeoFile: (propertyId: string, fileId: string) =>
    getOne<{ url: string; fileName: string }>(
      `/shared/properties/${propertyId}/google-earth/${fileId}/download`,
    ),
};

// --- Transverse -------------------------------------------------------------

export const mapsApi = {
  markers: (params: Record<string, unknown>) =>
    getOne<MapMarker[]>('/maps/properties', params),
  parcels: (params: Record<string, unknown>) =>
    getOne<ParcelCollection>('/maps/parcels', params),
  bounds: (params: Record<string, unknown>) =>
    getOne<{
      minLatitude: number;
      minLongitude: number;
      maxLatitude: number;
      maxLongitude: number;
      center: { latitude: number; longitude: number };
      count: number;
    } | null>('/maps/bounds', params),
};

export const dashboardApi = {
  overview: () => getOne<DashboardOverview>('/dashboard/overview'),
  properties: () => getOne<DashboardProperties>('/dashboard/properties'),
  projects: () => getOne<DashboardProjects>('/dashboard/projects'),
  documents: () => getOne<DashboardDocuments>('/dashboard/documents'),
  acquisitions: (months = 24) =>
    getOne<AcquisitionPoint[]>('/dashboard/acquisitions', { months }),
  activity: () => getOne<DashboardActivity>('/dashboard/activity'),
};

export const searchApi = {
  find: (term: string) =>
    getOne<{ query: string; total: number; results: SearchHit[] }>('/search', {
      q: term,
    }),
};

export const notificationsApi = {
  list: (params: Record<string, unknown>) =>
    getList<Notification>('/notifications', params),
  unreadCount: () => getOne<{ count: number }>('/notifications/unread-count'),
  markAsRead: (id: string) =>
    http.patch(`/notifications/${id}/read`).then(() => undefined),
  markAllAsRead: () => http.post('/notifications/read-all').then(() => undefined),
};

export const auditApi = {
  list: (params: Record<string, unknown>) => getList<AuditEntry>('/audit-logs', params),
};

export const usersApi = {
  list: (params: Record<string, unknown>) => getList<AppUser>('/users', params),
  create: (payload: unknown) => http.post('/users', payload).then(() => undefined),
  setActive: (id: string, active: boolean) =>
    http.post(`/users/${id}/${active ? 'activate' : 'deactivate'}`).then(() => undefined),
  remove: (id: string) => http.delete(`/users/${id}`).then(() => undefined),
};
