import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Input, PasswordInput } from '@/components/ui/Field';
import { Alert } from '@/components/ui/feedback';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const user = await login({ email, password });

      const from = (location.state as { from?: string } | null)?.from;
      const fallback = user.roles.includes('UTILISATEUR_PARTAGE')
        ? '/shared'
        : '/dashboard';

      navigate(from ?? fallback, { replace: true });
    } catch (caught) {
      // Le backend renvoie un message unique pour toutes les causes d'échec :
      // on le reprend tel quel, sans chercher à le préciser.
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Connexion impossible. Réessayez.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink dark:text-white">Connexion</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Accédez à votre espace de gestion.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Input
        label="Adresse email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        autoComplete="username"
        required
        autoFocus
        placeholder="vous@exemple.com"
      />

      <PasswordInput
        label="Mot de passe"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
        required
      />

      <Button type="submit" loading={submitting} className="w-full" size="lg">
        Se connecter
      </Button>

      <p className="text-center text-sm">
        <Link
          to="/forgot-password"
          className="text-brand-600 dark:text-brand-400 transition-colors hover:text-brand-700 dark:hover:text-brand-300"
        >
          Mot de passe oublié ?
        </Link>
      </p>
    </form>
  );
}
