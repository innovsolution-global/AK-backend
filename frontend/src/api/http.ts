import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import { ApiError, type ApiErrorBody } from './types';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

/**
 * Client HTTP de l'application.
 *
 * L'access token vit **en mémoire** : le stocker dans `localStorage`
 * l'exposerait à toute injection XSS. Il est perdu au rechargement de la page,
 * et reconstitué par un appel à `/auth/refresh` — le refresh token voyageant
 * dans un cookie `httpOnly` inaccessible au JavaScript.
 */
let accessToken: string | null = null;

/** Rappel invoqué quand la session devient irrécupérable. */
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler;
}

export const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  // Indispensable pour que le cookie de refresh accompagne /auth/refresh.
  withCredentials: true,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

/**
 * Rafraîchissement en cours, partagé par tous les appels concurrents.
 *
 * Sans cette file, dix requêtes recevant `401` en même temps déclencheraient
 * dix rotations : la première invaliderait les neuf autres, qui échoueraient
 * alors définitivement.
 */
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  refreshPromise ??= axios
    .post<{ data: { accessToken: string } }>(
      `${BASE_URL}/auth/refresh`,
      {},
      { withCredentials: true },
    )
    .then((response) => {
      const token = response.data.data.accessToken;
      accessToken = token;
      return token;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    // Un 401 sur /auth/refresh signifie que la session est définitivement
    // close : réessayer bouclerait indéfiniment.
    const isRefreshCall = config?.url?.includes('/auth/refresh') ?? false;

    if (status === 401 && config && !config._retried && !isRefreshCall) {
      config._retried = true;

      try {
        const token = await refreshAccessToken();
        config.headers.Authorization = `Bearer ${token}`;
        return await http.request(config);
      } catch {
        accessToken = null;
        onSessionExpired?.();
      }
    }

    if (status === 401 && (isRefreshCall || config?._retried)) {
      accessToken = null;
      onSessionExpired?.();
    }

    throw toApiError(error);
  },
);

function toApiError(error: AxiosError<ApiErrorBody>): ApiError {
  const body = error.response?.data;

  if (body?.message) {
    return new ApiError(body);
  }

  if (error.code === 'ECONNABORTED') {
    return new ApiError({
      message: 'Le serveur met trop de temps à répondre. Réessayez.',
      error: 'TIMEOUT',
      statusCode: 0,
    });
  }

  if (!error.response) {
    return new ApiError({
      message: 'Serveur injoignable. Vérifiez votre connexion.',
      error: 'NETWORK_ERROR',
      statusCode: 0,
    });
  }

  return new ApiError({
    message: 'Une erreur inattendue est survenue.',
    error: 'UNKNOWN',
    statusCode: error.response.status,
  });
}

/** Tente de restaurer une session au démarrage de l'application. */
export async function restoreSession(): Promise<string | null> {
  try {
    return await refreshAccessToken();
  } catch {
    return null;
  }
}
