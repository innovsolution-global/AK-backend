import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export default function NotFoundPage() {
  const { isAuthenticated, isSharedUser } = useAuth();

  const home = !isAuthenticated ? '/login' : isSharedUser ? '/shared' : '/dashboard';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 dark:bg-night-800 px-6 text-center">
      <p className="text-5xl font-bold text-slate-200">404</p>
      <h1 className="mt-3 text-lg font-semibold text-ink dark:text-white">Page introuvable</h1>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">
        Cette adresse ne correspond à aucune page de la plateforme.
      </p>
      <Link
        to={home}
        className="mt-6 rounded-2xl bg-gradient-brand px-5 py-2.5 text-sm font-semibold text-white shadow-glow-brand"
      >
        Retour à l'accueil
      </Link>
    </div>
  );
}
