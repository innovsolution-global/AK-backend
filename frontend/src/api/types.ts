/** Enveloppe de réponse du backend (doc 1, §1.6). */
export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  meta: PaginationMeta;
}

/** Détail d'erreur rattaché à un champ de formulaire. */
export interface ApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

/** Format d'erreur standardisé (§39). */
export interface ApiErrorBody {
  success: false;
  statusCode: number;
  message: string;
  error: string;
  details: ApiErrorDetail[];
  timestamp: string;
  path: string;
}

/**
 * Erreur normalisée propagée aux composants.
 *
 * Toute erreur — réseau, HTTP, parsing — arrive sous cette forme : les écrans
 * n'ont jamais à inspecter la structure d'Axios.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: ApiErrorDetail[];

  constructor(body: Partial<ApiErrorBody> & { message: string }) {
    super(body.message);
    this.name = 'ApiError';
    this.statusCode = body.statusCode ?? 0;
    this.code = body.error ?? 'UNKNOWN';
    this.details = body.details ?? [];
  }

  /** `true` si l'erreur vient de la requête et non du serveur. */
  get isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500;
  }

  get isNetworkError(): boolean {
    return this.statusCode === 0;
  }

  /** Message d'erreur associé à un champ, pour l'afficher sous l'input. */
  fieldError(field: string): string | undefined {
    return this.details.find((detail) => detail.field === field)?.message;
  }
}

export interface ListQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
}
