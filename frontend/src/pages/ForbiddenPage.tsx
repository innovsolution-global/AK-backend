import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-500/10">
        <Icon name="audit" className="h-6 w-6 text-amber-600 dark:text-amber-400" />
      </div>
      <h1 className="text-lg font-semibold text-ink dark:text-white">Accès non autorisé</h1>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">
        Votre rôle ne vous donne pas accès à cette section. Rapprochez-vous d'un
        administrateur si vous pensez qu'il s'agit d'une erreur.
      </p>
      <Link
        to="/dashboard"
        className="mt-6 rounded-2xl bg-gradient-brand px-5 py-2.5 text-sm font-semibold text-white shadow-glow-brand"
      >
        Retour au tableau de bord
      </Link>
    </div>
  );
}
