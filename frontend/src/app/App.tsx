import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { ThemeProvider } from '@/features/theme/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { AppRoutes } from '@/routes';
import { queryClient } from './query-client';
import { ErrorBoundary } from './ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      {/* Le thème enveloppe tout : la page d'erreur et les écrans publics
          doivent aussi respecter le choix clair/sombre. */}
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <ToastProvider>
                <AppRoutes />
              </ToastProvider>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
