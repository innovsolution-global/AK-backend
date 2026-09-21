import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Dernier filet : une exception de rendu non rattrapée laisserait sinon une
 * page blanche, sans aucune indication pour l'utilisateur.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Erreur de rendu non rattrapée', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;

    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="card w-full max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold text-slate-900">
            L'application a rencontré une erreur
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Rechargez la page. Si le problème persiste, signalez-le à
            l'administrateur.
          </p>
          {import.meta.env.DEV && (
            <pre className="mt-4 overflow-x-auto rounded bg-slate-100 p-3 text-left text-xs text-red-700">
              {error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 h-10 w-full rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
          >
            Recharger la page
          </button>
        </div>
      </div>
    );
  }
}
