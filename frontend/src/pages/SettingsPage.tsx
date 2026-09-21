import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/api/types';
import { authApi } from '@/features/auth/auth.api';
import { Button } from '@/components/ui/Button';
import { PasswordInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { PasswordField, isPasswordValid } from '@/components/ui/PasswordField';
import { Alert } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const mismatch = confirmation.length > 0 && next !== confirmation;
  const canSubmit =
    current.length > 0 && isPasswordValid(next) && !mismatch && confirmation.length > 0;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await authApi.changePassword(current, next);
      toast.success('Mot de passe modifié. Reconnectez-vous.');

      // Le backend incrémente `tokenVersion` : la session en cours n'est plus
      // valide, il faut donc repasser par l'écran de connexion.
      await logout();
      navigate('/login', { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Modification impossible.',
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader icon="users" title="Mon compte" description={user?.email} />

      <Panel>
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink dark:text-white">Profil</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Nom
            </dt>
            <dd className="mt-0.5 text-sm text-ink dark:text-white">
              {user?.firstName} {user?.lastName}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Email
            </dt>
            <dd className="mt-0.5 text-sm text-ink dark:text-white">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Rôles
            </dt>
            <dd className="mt-0.5 text-sm text-ink dark:text-white">
              {user?.roles.join(', ')}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Permissions
            </dt>
            <dd className="mt-0.5 text-sm text-ink dark:text-white">
              {user?.permissions.length ?? 0} accordée(s)
            </dd>
          </div>
        </dl>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 text-sm font-semibold text-ink dark:text-white">
          Changer mon mot de passe
        </h2>
        <p className="mb-4 text-sm text-ink-muted">
          Toutes vos sessions seront fermées après modification.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}

          <PasswordInput
            label="Mot de passe actuel"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            autoComplete="current-password"
            required
          />

          <PasswordField
            label="Nouveau mot de passe"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            required
            showRules
          />

          <PasswordInput
            label="Confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            error={mismatch ? 'Les deux mots de passe diffèrent.' : undefined}
            autoComplete="new-password"
            required
          />

          <div className="flex justify-end">
            <Button type="submit" loading={submitting} disabled={!canSubmit}>
              Modifier le mot de passe
            </Button>
          </div>
        </form>
      </section>
      </Panel>
    </div>
  );
}
