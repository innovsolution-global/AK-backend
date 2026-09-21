import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/api/types';
import { authApi } from '@/features/auth/auth.api';
import { Button } from '@/components/ui/Button';
import { PasswordInput } from '@/components/ui/Field';
import { Alert } from '@/components/ui/feedback';
import { PasswordField, isPasswordValid } from '@/components/ui/PasswordField';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const mismatch = confirmation.length > 0 && password !== confirmation;
  const canSubmit = isPasswordValid(password) && !mismatch && confirmation.length > 0;

  if (!token) {
    return (
      <div className="space-y-5">
        <Alert tone="error" title="Lien invalide">
          Ce lien de réinitialisation est incomplet. Demandez-en un nouveau.
        </Alert>
        <Link
          to="/forgot-password"
          className="block text-center text-sm text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
        >
          Demander un nouveau lien
        </Link>
      </div>
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      window.setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Réinitialisation impossible.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Alert tone="success" title="Mot de passe modifié">
        Vous allez être redirigé vers la page de connexion. Toutes vos sessions
        ouvertes ont été fermées.
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink dark:text-white">Nouveau mot de passe</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Choisissez un mot de passe que vous n'utilisez nulle part ailleurs.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <PasswordField
        label="Nouveau mot de passe"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        autoFocus
        showRules
      />

      <PasswordInput
        label="Confirmation"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        error={mismatch ? 'Les deux mots de passe diffèrent.' : undefined}
        required
        autoComplete="new-password"
      />

      <Button
        type="submit"
        loading={submitting}
        disabled={!canSubmit}
        className="w-full"
        size="lg"
      >
        Enregistrer
      </Button>
    </form>
  );
}
