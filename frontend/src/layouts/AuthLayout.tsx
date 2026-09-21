import { Outlet } from 'react-router-dom';
import { ThemeToggle } from '@/features/theme/ThemeToggle';

export function AuthLayout() {
  return (
    <div className="relative flex min-h-screen flex-col bg-white dark:bg-night-900">
      {/* Halo décoratif : un souffle de la couleur de marque derrière la carte. */}
      <div
        className="pointer-events-none absolute left-1/2 top-24 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-400/20 blur-3xl dark:bg-brand-500/10"
        aria-hidden="true"
      />

      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      <div className="relative flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-brand text-xl font-extrabold text-white shadow-glow-brand">
              AK
            </div>
            <h1 className="mt-5 text-2xl font-bold text-ink dark:text-white">AK IMMO</h1>
            <p className="mt-1 text-sm text-ink-muted">Plateforme privée de gestion de patrimoine</p>
          </div>

          <div className="card p-7 sm:p-9">
            <Outlet />
          </div>
        </div>
      </div>

      <footer className="px-4 pb-6 text-center text-xs text-ink-muted">
        Accès réservé. Toute connexion est enregistrée.
      </footer>
    </div>
  );
}
