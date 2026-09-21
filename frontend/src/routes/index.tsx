import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { SharedLayout } from '@/layouts/SharedLayout';
import {
  FullPageLoader,
  PermissionRoute,
  ProtectedRoute,
  PublicOnlyRoute,
  SharedRoute,
} from './guards';

// Chargement différé par route : la carte et ses dépendances (§38) ne pèsent
// sur le bundle initial d'aucun écran qui ne les utilise pas.
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'));
const ActivateSharePage = lazy(() => import('@/pages/ActivateSharePage'));

const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const PropertiesPage = lazy(() => import('@/pages/PropertiesPage'));
const PropertyDetailPage = lazy(() => import('@/pages/PropertyDetailPage'));
const PropertyFormPage = lazy(() => import('@/pages/PropertyFormPage'));
const MapPage = lazy(() => import('@/pages/MapPage'));
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('@/pages/ProjectDetailPage'));
const LocationsPage = lazy(() => import('@/pages/LocationsPage'));
const SitesPage = lazy(() => import('@/pages/SitesPage'));
const CompaniesPage = lazy(() => import('@/pages/CompaniesPage'));
const SharesPage = lazy(() => import('@/pages/SharesPage'));
const UsersPage = lazy(() => import('@/pages/UsersPage'));
const AuditPage = lazy(() => import('@/pages/AuditPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));

const SharedHomePage = lazy(() => import('@/pages/shared/SharedHomePage'));
const SharedPropertyPage = lazy(() => import('@/pages/shared/SharedPropertyPage'));

const ForbiddenPage = lazy(() => import('@/pages/ForbiddenPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

export function AppRoutes() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        {/* --- Public --- */}
        <Route
          element={
            <PublicOnlyRoute>
              <AuthLayout />
            </PublicOnlyRoute>
          }
        >
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>

        {/* Accessibles même connecté : on arrive dessus depuis un lien email. */}
        <Route element={<AuthLayout />}>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/activate-share" element={<ActivateSharePage />} />
        </Route>

        {/* --- Application interne --- */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          <Route
            path="/dashboard"
            element={
              <PermissionRoute permission="dashboard.read">
                <DashboardPage />
              </PermissionRoute>
            }
          />

          <Route
            path="/properties"
            element={
              <PermissionRoute permission="property.read">
                <PropertiesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/properties/create"
            element={
              <PermissionRoute permission="property.create">
                <PropertyFormPage mode="create" />
              </PermissionRoute>
            }
          />
          <Route
            path="/properties/:id"
            element={
              <PermissionRoute permission="property.read">
                <PropertyDetailPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/properties/:id/edit"
            element={
              <PermissionRoute permission="property.update">
                <PropertyFormPage mode="edit" />
              </PermissionRoute>
            }
          />

          <Route
            path="/map"
            element={
              <PermissionRoute permission="map.read">
                <MapPage />
              </PermissionRoute>
            }
          />

          <Route
            path="/projects"
            element={
              <PermissionRoute permission="project.read">
                <ProjectsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/projects/:id"
            element={
              <PermissionRoute permission="project.read">
                <ProjectDetailPage />
              </PermissionRoute>
            }
          />

          <Route
            path="/locations"
            element={
              <PermissionRoute permission="location.read">
                <LocationsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/sites"
            element={
              <PermissionRoute permission="site.read">
                <SitesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/companies"
            element={
              <PermissionRoute permission="company.read">
                <CompaniesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/shares"
            element={
              <PermissionRoute permission="property.share">
                <SharesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/users"
            element={
              <PermissionRoute permission="user.manage">
                <UsersPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/audit-logs"
            element={
              <PermissionRoute permission="audit.read">
                <AuditPage />
              </PermissionRoute>
            }
          />

          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/forbidden" element={<ForbiddenPage />} />
        </Route>

        {/* --- Espace du bénéficiaire (§22) --- */}
        <Route
          element={
            <SharedRoute>
              <SharedLayout />
            </SharedRoute>
          }
        >
          <Route path="/shared" element={<SharedHomePage />} />
          <Route path="/shared/properties/:id" element={<SharedPropertyPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
