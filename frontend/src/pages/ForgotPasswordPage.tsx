import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '@/features/auth/auth.api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Alert } from '@/components/ui/feedback';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      await authApi.forgotPassword(email);
    } finally {
      // Le backend répond toujours 204, que l'adresse existe ou non. L'écran
      // affiche donc le même message dans tous les cas : afficher une erreur
      // révélerait quels comptes existent.
      setSent(true);
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-5">
        <Alert tone="success" title="Demande enregistrée">
          Si un compte est associé à <strong>{email}</strong>, un lien de
          réinitialisation vient d'être envoyé. Il est valable 30 minutes.
        </Alert>
        <Link
          to="/login"
          className="block text-center text-sm text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
        >
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink dark:text-white">Mot de passe oublié</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Indiquez votre adresse : un lien de réinitialisation vous sera envoyé.
        </p>
      </div>

      <Input
        label="Adresse email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        autoFocus
        autoComplete="username"
      />

      <Button type="submit" loading={submitting} className="w-full" size="lg">
        Envoyer le lien
      </Button>

      <p className="text-center text-sm">
        <Link to="/login" className="text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300">
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}
