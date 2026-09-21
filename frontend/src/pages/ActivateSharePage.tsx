import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { sharesApi } from '@/api/endpoints';
import { ApiError } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { PasswordInput } from '@/components/ui/Field';
import { Alert } from '@/components/ui/feedback';
import { PasswordField, isPasswordValid } from '@/components/ui/PasswordField';
import { useAuth } from '@/hooks/useAuth';
import { formatDate } from '@/utils/format';

/**
 * Activation d'un partage (§21).
 *
 * Le bénéficiaire choisit **lui-même** son mot de passe : aucun secret n'est
 * transmis par un tiers, et le lien reste à usage unique.
 */
export default function ActivateSharePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { login } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['share-token', token],
    queryFn: () => sharesApi.validateToken(token),
    enabled: token.length > 0,
    retry: false,
  });

  const mismatch = confirmation.length > 0 && password !== confirmation;
  const canSubmit = isPasswordValid(password) && !mismatch && confirmation.length > 0;

  if (!token) {
    return (
      <Alert tone="error" title="Lien invalide">
        Ce lien d'activation est incomplet. Rapprochez-vous de la personne qui
        vous l'a transmis.
      </Alert>
    );
  }

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-ink-muted">Vérification du lien…</p>;
  }

  if (!data?.valid) {
    return (
      <div className="space-y-5">
        <Alert tone="error" title="Lien expiré ou déjà utilisé">
          Ce lien d'activation n'est plus valable. Demandez un nouvel accès à la
          personne qui vous l'a partagé.
        </Alert>
        <Link to="/login" className="block text-center text-sm text-brand-600 dark:text-brand-400">
          Aller à la connexion
        </Link>
      </div>
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await sharesApi.activate(token, password);
      // Connexion enchaînée : le bénéficiaire vient de choisir son mot de
      // passe, lui redemander de le saisir n'apporterait rien.
      await login({ email: result.email, password });
      navigate('/shared', { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Activation impossible.',
      );
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink dark:text-white">
          Bonjour {data.beneficiaryFirstName}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Un bien vous a été partagé : <strong>{data.propertyReference}</strong>.
          Définissez votre mot de passe pour y accéder.
        </p>
      </div>

      <Alert tone="info">
        Cet accès est limité à ce seul bien et expire le{' '}
        <strong>{formatDate(data.expiresAt)}</strong>.
      </Alert>

      {error && <Alert tone="error">{error}</Alert>}

      <PasswordField
        label="Choisissez un mot de passe"
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
        Activer mon accès
      </Button>
    </form>
  );
}
