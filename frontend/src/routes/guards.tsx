import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-700" />
        <p className="text-sm text-slate-500">Chargement…</p>
      </div>
    </div>
  );
}

/** Exige une session ouverte. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, isSharedUser } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageLoader />;

  if (!isAuthenticated) {
    // La destination est mémorisée pour y revenir après la connexion.
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Un bénéficiaire n'a rien à faire dans l'application interne : le backend
  // le refuserait de toute façon, autant lui éviter des écrans vides.
  if (isSharedUser) {
    return <Navigate to="/shared" replace />;
  }

  return <>{children}</>;
}

/** Exige une permission ; sinon renvoie vers une page accessible. */
export function PermissionRoute({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const { can, isLoading } = useAuth();

  if (isLoading) return <FullPageLoader />;

  if (!can(permission)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}

/** Espace du bénéficiaire, interdit aux comptes internes. */
export function SharedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, isSharedUser } = useAuth();

  if (isLoading) return <FullPageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isSharedUser) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

/** Empêche un utilisateur déjà connecté de revoir l'écran de connexion. */
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, isSharedUser } = useAuth();

  if (isLoading) return <FullPageLoader />;

  if (isAuthenticated) {
    return <Navigate to={isSharedUser ? '/shared' : '/dashboard'} replace />;
  }

  return <>{children}</>;
}

export { FullPageLoader };
