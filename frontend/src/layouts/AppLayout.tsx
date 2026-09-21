import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/utils/cn';
import { formatNumber } from '@/utils/format';
import { GlobalSearch } from '@/features/search/GlobalSearch';
import { NotificationsMenu } from '@/features/notifications/NotificationsMenu';
import { ThemeToggle } from '@/features/theme/ThemeToggle';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PageTransition, motion } from '@/components/motion';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  permission?: string;
  badgeKey?: 'expiringShares';
}

const NAVIGATION: Array<{ section?: string; items: NavItem[] }> = [
  {
    items: [
      { to: '/dashboard', label: 'Accueil', icon: 'home', permission: 'dashboard.read' },
      { to: '/properties', label: 'Terrains', icon: 'land', permission: 'property.read' },
      { to: '/projects', label: 'Projets', icon: 'project', permission: 'project.read' },
      { to: '/map', label: 'Carte', icon: 'map', permission: 'map.read' },
      {
        to: '/shares',
        label: 'Partages',
        icon: 'share',
        permission: 'property.share',
        badgeKey: 'expiringShares',
      },
    ],
  },
  {
    section: 'Référentiels',
    items: [
      { to: '/locations', label: 'Villes', icon: 'city', permission: 'location.read' },
      { to: '/sites', label: 'Sites', icon: 'site', permission: 'site.read' },
      { to: '/companies', label: 'Entreprises', icon: 'company', permission: 'company.read' },
    ],
  },
  {
    section: 'Administration',
    items: [
      { to: '/users', label: 'Utilisateurs', icon: 'users', permission: 'user.manage' },
      { to: '/audit-logs', label: "Journal d'audit", icon: 'audit', permission: 'audit.read' },
    ],
  },
];

const COLLAPSED_KEY = 'ak-immo.sidebar-collapsed';

export function AppLayout() {
  const { user, can, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // Sans stockage, l'état vaut pour la session.
    }
  }, [collapsed]);

  // L'indicateur « patrimoine » de la barre supérieure et le badge des
  // partages partagent la requête du tableau de bord : une seule lecture.
  const overview = useQuery({
    queryKey: queryKeys.dashboard.overview(),
    queryFn: dashboardApi.overview,
    enabled: can('dashboard.read'),
    staleTime: 60_000,
  });

  const badges: Record<NonNullable<NavItem['badgeKey']>, number> = {
    expiringShares: overview.data?.shares.expiringSoon ?? 0,
  };

  const sections = NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permission || can(item.permission)),
  })).filter((section) => section.items.length > 0);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const initials = user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}` : '?';

  return (
    <div className="min-h-screen bg-white dark:bg-night-900">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Barre latérale                                                    */}
      {/* ---------------------------------------------------------------- */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col bg-white transition-[width,transform] duration-300',
          'dark:bg-night-900 lg:translate-x-0',
          collapsed ? 'w-24' : 'w-72',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo + repli */}
        <div className={cn('flex h-24 items-center px-6', collapsed ? 'justify-center' : 'gap-3')}>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-brand text-base font-extrabold text-white shadow-glow-brand">
            AK
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-xl font-bold text-ink dark:text-white">AK IMMO</p>
              <p className="text-xs font-medium text-ink-muted">Gestion de patrimoine</p>
            </div>
          )}
          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-300 text-ink transition-colors hover:bg-slate-50 dark:border-white/15 dark:text-white dark:hover:bg-white/5 lg:flex"
              aria-label="Replier le menu"
            >
              <Icon name="chevronLeft" className="h-4 w-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="mx-auto mb-2 hidden h-10 w-10 items-center justify-center rounded-full border border-slate-300 text-ink transition-colors hover:bg-slate-50 dark:border-white/15 dark:text-white dark:hover:bg-white/5 lg:flex"
            aria-label="Déplier le menu"
          >
            <Icon name="chevronRight" className="h-4 w-4" />
          </button>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-4 pb-4 pt-4">
          {sections.map((section, sectionIndex) => (
            <div key={section.section ?? sectionIndex} className={sectionIndex > 0 ? 'mt-8' : ''}>
              {section.section && !collapsed && (
                <p className="mb-3 px-4 text-sm font-medium text-ink-muted">{section.section}</p>
              )}
              {section.section && collapsed && (
                <div className="mx-auto mb-3 h-px w-8 bg-slate-200 dark:bg-white/10" />
              )}

              <ul className="space-y-1.5">
                {section.items.map((item) => {
                  const isActive =
                    location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
                  const badge = item.badgeKey ? badges[item.badgeKey] : 0;

                  return (
                    <li key={item.to} className="relative">
                      {isActive && (
                        <motion.span
                          layoutId="sidebar-active"
                          className="absolute inset-0 rounded-pill bg-gradient-brand shadow-glow-brand"
                          transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                        />
                      )}
                      <NavLink
                        to={item.to}
                        onClick={() => setMobileOpen(false)}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          'relative flex h-14 items-center rounded-pill text-[15px] font-semibold transition-colors',
                          collapsed ? 'justify-center' : 'gap-4 px-5',
                          isActive
                            ? 'text-white'
                            : 'text-ink hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5',
                        )}
                      >
                        <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                        {badge > 0 && (
                          <span
                            className={cn(
                              'flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                              isActive
                                ? 'bg-white/25 text-white'
                                : 'bg-success-500 text-white',
                              collapsed && 'absolute -right-0.5 -top-0.5 h-5 min-w-5 text-[10px]',
                            )}
                          >
                            {badge}
                          </span>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Déconnexion */}
        <div className="px-4 pb-6">
          <NavLink
            to="/settings"
            onClick={() => setMobileOpen(false)}
            title={collapsed ? 'Mon compte' : undefined}
            className={({ isActive }) =>
              cn(
                'mb-1.5 flex h-14 items-center rounded-pill text-[15px] font-semibold transition-colors',
                collapsed ? 'justify-center' : 'gap-4 px-5',
                isActive
                  ? 'bg-slate-100 text-ink dark:bg-white/10 dark:text-white'
                  : 'text-ink hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5',
              )
            }
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-xs font-bold text-white">
              {initials}
            </span>
            {!collapsed && <span className="truncate">Mon compte</span>}
          </NavLink>

          <button
            type="button"
            onClick={handleLogout}
            title={collapsed ? 'Déconnexion' : undefined}
            className={cn(
              'flex h-14 w-full items-center rounded-pill text-[15px] font-semibold text-ink transition-colors',
              'hover:bg-red-50 hover:text-red-600 dark:text-slate-200 dark:hover:bg-red-500/10 dark:hover:text-red-400',
              collapsed ? 'justify-center' : 'gap-4 px-5',
            )}
          >
            <Icon name="logout" className="h-5 w-5 shrink-0" />
            {!collapsed && 'Déconnexion'}
          </button>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- */}
      {/* Zone principale                                                   */}
      {/* ---------------------------------------------------------------- */}
      <div className={cn('transition-[padding] duration-300', collapsed ? 'lg:pl-24' : 'lg:pl-72')}>
        <header className="sticky top-0 z-20 flex h-24 items-center gap-4 bg-white/85 px-4 backdrop-blur-md dark:bg-night-900/85 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 text-ink dark:border-white/15 dark:text-white lg:hidden"
            aria-label="Ouvrir le menu"
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>

          <GlobalSearch />

          <div className="ml-auto flex items-center gap-3 sm:gap-5">
            <NotificationsMenu />

            {overview.data && (
              <>
                <span className="hidden h-12 w-px bg-slate-200 dark:bg-white/10 md:block" />
                <div className="hidden leading-tight md:block">
                  <p className="text-xs font-medium text-ink-muted">Patrimoine</p>
                  <p className="text-xl font-bold text-accent-600 dark:text-accent-400">
                    {formatNumber(overview.data.properties.totalAreaHectares, 1)}
                    <span className="ml-1 text-sm font-semibold">ha</span>
                  </p>
                </div>
              </>
            )}

            <span className="hidden h-12 w-px bg-slate-200 dark:bg-white/10 sm:block" />

            <NavLink to="/settings" className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-brand text-sm font-bold text-white">
                {initials}
              </span>
              <span className="hidden text-lg font-semibold text-ink dark:text-white sm:block">
                <span className="text-accent-600 dark:text-accent-400">Bonjour,</span> {user?.firstName}
              </span>
            </NavLink>

            <ThemeToggle className="hidden sm:flex" />
          </div>
        </header>

        <main className="px-4 pb-10 pt-2 sm:px-6 lg:px-8">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
      </div>
    </div>
  );
}
