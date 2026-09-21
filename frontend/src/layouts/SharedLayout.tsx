import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Icon } from '@/components/ui/Icon';
import { ThemeToggle } from '@/features/theme/ThemeToggle';

/**
 * Coquille de l'espace bénéficiaire (§22) — délibérément dépouillée : ni
 * navigation vers le patrimoine, ni recherche, ni indicateurs.
 */
export function SharedLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-night-900">
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-md dark:bg-night-900/85">
        <div className="mx-auto flex h-24 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Link to="/shared" className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-brand text-base font-extrabold text-white shadow-glow-brand">
              AK
            </div>
            <div className="leading-tight">
              <p className="text-lg font-bold text-ink dark:text-white">AK IMMO</p>
              <p className="text-xs font-medium text-ink-muted">Accès partagé</p>
            </div>
          </Link>

          <div className="ml-auto flex items-center gap-4">
            <span className="hidden text-base font-semibold text-ink dark:text-white sm:inline">
              <span className="text-accent-600 dark:text-accent-400">Bonjour,</span> {user?.firstName}
            </span>
            <ThemeToggle className="hidden sm:flex" />
            <button
              type="button"
              onClick={handleLogout}
              className="pill-outline inline-flex h-11 items-center gap-2 px-4 text-sm font-semibold transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
            >
              <Icon name="logout" className="h-4 w-4" />
              <span className="hidden sm:inline">Quitter</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-ink-muted sm:px-6">
        Accès temporaire accordé par le propriétaire. Vos consultations sont enregistrées.
      </footer>
    </div>
  );
}
