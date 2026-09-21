import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  restoreSession,
  setAccessToken,
  setSessionExpiredHandler,
} from '@/api/http';
import type { AuthUser, RoleCode } from '@/types/domain';
import { authApi, type LoginPayload } from './auth.api';

export interface AuthContextValue {
  user: AuthUser | null;
  /** `true` tant que la restauration de session initiale n'est pas terminée. */
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  can: (permission: string) => boolean;
  hasRole: (role: RoleCode) => boolean;
  isSharedUser: boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    // Le cache contient les données de l'utilisateur sortant : le vider évite
    // qu'un compte suivant voie brièvement celles du précédent.
    queryClient.clear();
  }, [queryClient]);

  // Restauration au démarrage : l'access token ne survit pas au rechargement,
  // mais le cookie de refresh, lui, est toujours là.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const token = await restoreSession();

      if (cancelled) return;

      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const profile = await authApi.me();
        if (!cancelled) setUser(profile);
      } catch {
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  // Le client HTTP signale une session définitivement perdue (refresh refusé).
  useEffect(() => {
    setSessionExpiredHandler(() => {
      clearSession();
    });
  }, [clearSession]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      const result = await authApi.login(payload);
      setAccessToken(result.accessToken);
      setUser(result.user);
      return result.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // La session locale est nettoyée même si l'appel échoue : l'utilisateur
      // ne doit jamais rester connecté côté client après avoir cliqué.
      clearSession();
    }
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const profile = await authApi.me();
    setUser(profile);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const permissions = new Set(user?.permissions ?? []);

    return {
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      logout,
      refreshUser,
      can: (permission: string) => permissions.has(permission),
      hasRole: (role: RoleCode) => user?.roles.includes(role) ?? false,
      isSharedUser: user?.roles.includes('UTILISATEUR_PARTAGE') ?? false,
    };
  }, [user, isLoading, login, logout, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
