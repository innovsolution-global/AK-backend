import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { dashboardApi, mapsApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { ChartCard, SimpleTable } from '@/components/charts/ChartCard';
import { BarList } from '@/components/charts/BarList';
import { AreaTrend } from '@/components/charts/AreaTrend';
import { Gauge } from '@/components/charts/Gauge';
import { KpiCard } from '@/components/charts/KpiCard';
import { CountUp, FadeIn, Stagger } from '@/components/motion';
import { Button, IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { DeltaPill, StatusBadge } from '@/components/ui/StatusBadge';
import { ErrorState } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { DashboardMap } from '@/features/map/DashboardMap';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/utils/cn';
import {
  formatArea,
  formatDate,
  formatFileSize,
  formatNumber,
  formatRelative,
  humanizeEnum,
} from '@/utils/format';
import { PROJECT_STATUSES, PROPERTY_STATUSES } from '@/types/domain';

const WINDOWS = [
  { months: 6, label: '6 derniers mois' },
  { months: 12, label: '12 derniers mois' },
  { months: 24, label: '24 derniers mois' },
  { months: 36, label: '36 derniers mois' },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [months, setMonths] = useState(24);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const overview = useQuery({ queryKey: queryKeys.dashboard.overview(), queryFn: dashboardApi.overview });
  const properties = useQuery({ queryKey: queryKeys.dashboard.properties(), queryFn: dashboardApi.properties });
  const projects = useQuery({ queryKey: queryKeys.dashboard.projects(), queryFn: dashboardApi.projects });
  const documents = useQuery({ queryKey: queryKeys.dashboard.documents(), queryFn: dashboardApi.documents });
  const activity = useQuery({ queryKey: queryKeys.dashboard.activity(), queryFn: dashboardApi.activity });
  const markers = useQuery({ queryKey: queryKeys.map.markers({}), queryFn: () => mapsApi.markers({}) });
  const acquisitions = useQuery({
    queryKey: queryKeys.dashboard.acquisitions(months),
    queryFn: () => dashboardApi.acquisitions(months),
    placeholderData: (previous) => previous,
  });

  // Le mois sélectionné suit la fenêtre : par défaut, le plus récent.
  useEffect(() => {
    setSelectedMonth(null);
  }, [months]);

  const o = overview.data;
  const series = acquisitions.data ?? [];
  const activeIndex = selectedMonth ?? Math.max(series.length - 1, 0);
  const activePoint = series[activeIndex];
  const previousPoint = activeIndex > 0 ? series[activeIndex - 1] : undefined;

  // --- Séries dérivées ------------------------------------------------------

  const trend = useMemo(
    () =>
      series.map((point, index) => {
        const date = parseISO(`${point.month}-01`);
        return {
          label: format(date, 'MMM yy', { locale: fr }),
          fullLabel: format(date, 'MMMM yyyy', { locale: fr }),
          value: point.count,
          secondary: point.areaSqm > 0 ? formatArea(point.areaSqm) : undefined,
          active: index === activeIndex,
        };
      }),
    [series, activeIndex],
  );

  const acquiredThisYear = useMemo(() => {
    const year = String(new Date().getFullYear());
    return series.filter((p) => p.month.startsWith(year)).reduce((sum, p) => sum + p.count, 0);
  }, [series]);

  const statusRows = useMemo(() => {
    const counts = new Map((properties.data?.byStatus ?? []).map((row) => [row.status, row]));
    return PROPERTY_STATUSES.filter((s) => (counts.get(s)?.count ?? 0) > 0).map((status) => {
      const row = counts.get(status);
      return {
        key: status,
        label: <StatusBadge status={status} kind="property" />,
        value: row?.count ?? 0,
        secondary: row ? formatArea(row.areaSqm) : undefined,
        onClick: () => navigate(`/properties?status=${status}`),
      };
    });
  }, [properties.data, navigate]);

  const locationRows = useMemo(
    () =>
      (properties.data?.byLocation ?? []).slice(0, 8).map((row) => ({
        key: row.locationId,
        label: row.locationName,
        value: row.count,
        secondary: formatArea(row.areaSqm),
        onClick: () => navigate(`/properties?locationId=${row.locationId}`),
      })),
    [properties.data, navigate],
  );

  const pipelineRows = useMemo(() => {
    const counts = new Map((projects.data?.byStatus ?? []).map((row) => [row.status, row.count]));
    const active = new Set(['TRAVAUX_EN_COURS', 'TRAVAUX_PREPARATION']);
    return PROJECT_STATUSES.filter((s) => (counts.get(s) ?? 0) > 0).map((status) => ({
      key: status,
      label: <StatusBadge status={status} kind="project" />,
      value: counts.get(status) ?? 0,
      emphasis: active.has(status),
      onClick: () => navigate(`/projects?status=${status}`),
    }));
  }, [projects.data, navigate]);

  const documentRows = useMemo(
    () =>
      (documents.data?.propertyDocuments.byType ?? [])
        .sort((a, b) => b.count - a.count)
        .map((row) => ({ key: row.type, label: humanizeEnum(row.type), value: row.count })),
    [documents.data],
  );

  // Taux d'aménagement : la part du patrimoine déjà aménagée.
  const development = useMemo(() => {
    const rows = properties.data?.byStatus ?? [];
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    const totalArea = rows.reduce((sum, row) => sum + row.areaSqm, 0);
    const developed = rows.filter((row) => row.status === 'AMENAGE');
    const developedCount = developed.reduce((sum, row) => sum + row.count, 0);
    const developedArea = developed.reduce((sum, row) => sum + row.areaSqm, 0);
    return {
      ratio: total > 0 ? developedCount / total : 0,
      developedCount,
      total,
      developedArea,
      remainingArea: totalArea - developedArea,
    };
  }, [properties.data]);

  const inWorks = o?.projects.byStatus.find((row) => row.key === 'TRAVAUX_EN_COURS')?.count ?? 0;

  // --- Export -----------------------------------------------------------------

  const exportReport = () => {
    if (!o || !properties.data) return;

    const lines: string[] = [
      'AK IMMO — rapport du tableau de bord',
      `Généré le;${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
      '',
      'Indicateur;Valeur',
      `Terrains;${o.properties.total}`,
      `Superficie totale (m²);${o.properties.totalAreaSqm}`,
      `Villes;${o.geography.locations}`,
      `Sites;${o.geography.sites}`,
      `Projets;${o.projects.total}`,
      `Documents;${o.documents.total}`,
      `Partages actifs;${o.shares.active}`,
      '',
      'Statut;Terrains;Superficie (m²)',
      ...properties.data.byStatus.map((row) => `${row.status};${row.count};${row.areaSqm}`),
      '',
      'Ville;Terrains;Superficie (m²)',
      ...properties.data.byLocation.map((row) => `${row.locationName};${row.count};${row.areaSqm}`),
      '',
      'Mois;Acquisitions;Superficie (m²);Cumul',
      ...series.map((p) => `${p.month};${p.count};${p.areaSqm};${p.cumulative}`),
    ];

    // BOM UTF-8 : sans lui Excel lit les accents de travers.
    const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ak-immo-rapport-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Rapport exporté.');
  };

  if (overview.error) {
    return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />;
  }

  return (
    <div>
      <FadeIn>
        <PageHeader
          icon="home"
          tone="accent"
          title="Tableau de bord"
          actions={
            <>
              <label className="pill-outline flex h-12 items-center gap-2.5 pl-4 pr-3 text-sm font-semibold">
                <Icon name="calendar" className="h-5 w-5 text-ink-muted" />
                <select
                  value={months}
                  onChange={(event) => setMonths(Number(event.target.value))}
                  className="appearance-none bg-transparent pr-6 text-ink outline-none dark:text-white"
                  aria-label="Période"
                >
                  {WINDOWS.map((window) => (
                    <option key={window.months} value={window.months}>
                      {window.label}
                    </option>
                  ))}
                </select>
                <Icon name="chevronDown" className="-ml-6 h-4 w-4 pointer-events-none text-ink-muted" />
              </label>

              <Button
                variant="success"
                size="lg"
                icon={<Icon name="cloudDownload" className="h-5 w-5" />}
                onClick={exportReport}
                disabled={!o || !properties.data}
              >
                Exporter le rapport
              </Button>
            </>
          }
        />
      </FadeIn>

      <div className="panel p-4 sm:p-6">
        {/* ---- Indicateurs -------------------------------------------- */}
        <Stagger className="grid gap-4 md:grid-cols-3">
          <FadeIn>
            <KpiCard
              icon="land"
              label="Terrains"
              value={o?.properties.total ?? 0}
              loading={overview.isLoading}
              delta={
                acquiredThisYear > 0
                  ? { value: `+${acquiredThisYear} cette année`, good: true }
                  : undefined
              }
              hint={acquiredThisYear === 0 ? 'Aucune acquisition cette année' : undefined}
              onClick={() => navigate('/properties')}
            />
          </FadeIn>
          <FadeIn>
            <KpiCard
              icon="layers"
              label="Superficie"
              value={o?.properties.totalAreaHectares ?? 0}
              unit="ha"
              decimals={(o?.properties.totalAreaHectares ?? 0) >= 100 ? 0 : 1}
              loading={overview.isLoading}
              hint={`${formatNumber(o?.properties.totalAreaSqm ?? 0, 0)} m² · ${o?.geography.locations ?? 0} villes`}
            />
          </FadeIn>
          <FadeIn>
            <KpiCard
              icon="project"
              label="Projets"
              value={o?.projects.total ?? 0}
              loading={overview.isLoading}
              delta={inWorks > 0 ? { value: `${inWorks} en travaux`, good: true } : undefined}
              hint={inWorks === 0 ? 'Aucun chantier en cours' : undefined}
              onClick={() => navigate('/projects')}
            />
          </FadeIn>
        </Stagger>

        {/* ---- Tendance + colonne droite --------------------------------- */}
        <Stagger delay={0.1} className="mt-4 grid gap-4 xl:grid-cols-12">
          <FadeIn className="xl:col-span-7">
            <section className="card flex h-full flex-col p-6">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold text-ink dark:text-white">Acquisitions</h2>
                <Button variant="secondary" size="sm" onClick={() => navigate('/properties?sort=purchaseDate')}>
                  Voir les terrains
                </Button>
              </div>

              {/* Indicateur du mois sélectionné */}
              <div className="mt-6 flex items-center gap-5">
                <div className="icon-disc h-[76px] w-[76px]">
                  <Icon name="calendar" className="h-8 w-8" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium text-ink-muted">
                    {activePoint ? `Acquis en ${format(parseISO(`${activePoint.month}-01`), 'MMMM yyyy', { locale: fr })}` : 'Acquisitions'}
                  </p>
                  <p className="mt-0.5 text-[2.6rem] font-extrabold leading-none tracking-tight text-ink dark:text-white">
                    <CountUp value={activePoint?.count ?? 0} />
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  {activePoint && previousPoint && (
                    <DeltaPill
                      value={`${activePoint.count - previousPoint.count >= 0 ? '+' : ''}${activePoint.count - previousPoint.count} vs préc.`}
                      good={activePoint.count >= previousPoint.count}
                    />
                  )}
                  {activePoint && (
                    <DeltaPill value={`${activePoint.cumulative} au total`} good />
                  )}
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-ink dark:text-white">Évolution dans le temps</h3>
                <span className="pill-outline flex h-9 items-center gap-2 px-3.5 text-xs font-semibold text-ink-muted">
                  <Icon name="calendar" className="h-4 w-4" />
                  {WINDOWS.find((w) => w.months === months)?.label}
                </span>
              </div>

              <div className={cn('mt-3 transition-opacity', acquisitions.isFetching && 'opacity-60')}>
                <AreaTrend
                  data={trend}
                  valueLabel="Terrains acquis"
                  height={230}
                  onPointClick={(index) => setSelectedMonth(index)}
                />
              </div>

              <MonthPager
                series={series}
                activeIndex={activeIndex}
                onSelect={(index) => setSelectedMonth(index)}
              />
            </section>
          </FadeIn>

          <FadeIn className="flex flex-col gap-4 xl:col-span-5">
            {/* Appel à l'action : la carte du patrimoine */}
            <section className="card relative overflow-hidden p-6">
              <div className="relative z-10 max-w-[60%]">
                <h2 className="text-lg font-bold text-ink dark:text-white">Où sont vos terrains ?</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {markers.data
                    ? `${markers.data.length} terrain(s) géolocalisé(s) sur ${o?.properties.total ?? 0}.`
                    : 'Visualisez l’implantation de votre patrimoine.'}
                </p>
                <Button
                  size="sm"
                  className="mt-5"
                  onClick={() => navigate('/map')}
                  icon={<Icon name="map" className="h-4 w-4" />}
                >
                  Ouvrir la carte
                </Button>
              </div>
              <MapIllustration className="pointer-events-none absolute -right-4 top-1/2 h-40 w-40 -translate-y-1/2" />
            </section>

            {/* Jauge d'aménagement */}
            <section className="card flex flex-1 flex-col p-6">
              <div className="flex items-start justify-between">
                <h2 className="text-lg font-bold text-ink dark:text-white">Taux d'aménagement</h2>
                <Link
                  to="/properties?status=AMENAGE"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-slate-100 dark:hover:bg-white/5"
                  aria-label="Voir les terrains aménagés"
                >
                  <Icon name="chevronRight" className="h-4 w-4" />
                </Link>
              </div>

              <div className="mt-4 flex-1">
                <Gauge value={development.ratio} size={260}>
                  <p className="text-[2.4rem] font-extrabold leading-none tracking-tight text-ink dark:text-white">
                    {formatNumber(development.ratio * 100, 1).replace('.', ',')}%
                  </p>
                  <p className="mt-1.5 text-xs font-semibold text-success-600">
                    {development.developedCount} sur {development.total} terrains
                  </p>
                </Gauge>
              </div>

              <div className="mt-4 flex items-end justify-between text-sm">
                <div>
                  <span className="text-ink-muted">Aménagés</span>
                  <span className="ml-2 font-bold text-ink dark:text-white">{formatArea(development.developedArea)}</span>
                </div>
                <div className="text-right">
                  <span className="text-ink-muted">Restant</span>
                  <span className="ml-2 font-bold text-ink dark:text-white">{formatArea(development.remainingArea)}</span>
                </div>
              </div>
            </section>
          </FadeIn>
        </Stagger>

        {/* ---- Répartitions ------------------------------------------- */}
        <Stagger delay={0.15} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <FadeIn>
            <ChartCard
              title="Par statut"
              subtitle="Cliquez pour filtrer la liste"
              loading={properties.isLoading}
              empty={statusRows.length === 0}
              table={<SimpleTable columns={['Statut', 'Terrains', 'Superficie']} rows={statusRows.map((r) => ({ label: r.label, value: r.value, extra: r.secondary }))} />}
              className="h-full"
            >
              <BarList items={statusRows} labelWidth={132} />
            </ChartCard>
          </FadeIn>
          <FadeIn>
            <ChartCard
              title="Par ville"
              subtitle={`${o?.geography.locations ?? 0} villes · ${o?.geography.sites ?? 0} sites`}
              loading={properties.isLoading}
              empty={locationRows.length === 0}
              table={<SimpleTable columns={['Ville', 'Terrains', 'Superficie']} rows={locationRows.map((r) => ({ label: r.label, value: r.value, extra: r.secondary }))} />}
              className="h-full"
            >
              <BarList items={locationRows} labelWidth={110} />
            </ChartCard>
          </FadeIn>
          <FadeIn className="md:col-span-2 xl:col-span-1">
            <ChartCard
              title="Pipeline des projets"
              subtitle="Chantiers en cours mis en avant"
              loading={projects.isLoading}
              empty={pipelineRows.length === 0}
              table={<SimpleTable columns={['Étape', 'Projets']} rows={pipelineRows.map((r) => ({ label: r.label, value: r.value }))} />}
              className="h-full"
            >
              <BarList items={pipelineRows} labelWidth={150} />
            </ChartCard>
          </FadeIn>
        </Stagger>

        {/* ---- Carte + activité --------------------------------------- */}
        <Stagger delay={0.2} className="mt-4 grid gap-4 xl:grid-cols-12">
          <FadeIn className="xl:col-span-7">
            <ChartCard
              title="Carte du patrimoine"
              subtitle="Couleur du repère = statut du terrain"
              action={
                <Button variant="secondary" size="sm" onClick={() => navigate('/map')}>
                  Plein écran
                </Button>
              }
              loading={markers.isLoading}
              empty={(markers.data?.length ?? 0) === 0}
              emptyLabel="Aucun terrain géolocalisé"
              className="h-full"
            >
              <DashboardMap markers={markers.data ?? []} height={340} />
            </ChartCard>
          </FadeIn>

          <FadeIn className="xl:col-span-5">
            <ChartCard
              title="Activité récente"
              loading={activity.isLoading}
              empty={(activity.data?.recentActivity.length ?? 0) === 0}
              emptyLabel="Aucune activité"
              className="h-full"
              bodyClassName="pt-1"
            >
              <ol className="divide-y divide-slate-50 dark:divide-white/5">
                {(activity.data?.recentActivity ?? []).slice(0, 8).map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 py-3">
                    <span className="icon-disc mt-0.5 h-8 w-8 text-xs font-bold">
                      {entry.user ? `${entry.user.firstName[0] ?? ''}${entry.user.lastName[0] ?? ''}` : '·'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink dark:text-white">
                        <span className="font-semibold">
                          {entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : 'Système'}
                        </span>{' '}
                        <span className="text-ink-muted">{describeAction(entry)}</span>
                      </p>
                      <p className="text-[11px] text-ink-muted">{formatRelative(entry.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </ChartCard>
          </FadeIn>
        </Stagger>

        {/* ---- Échéances + top + documents ---------------------------- */}
        <Stagger delay={0.25} className="mt-4 grid gap-4 xl:grid-cols-3">
          <FadeIn>
            <ChartCard
              title="Partages à échéance"
              subtitle="Accès expirant sous 30 jours"
              loading={activity.isLoading}
              empty={(activity.data?.expiringShares.length ?? 0) === 0}
              emptyLabel="Aucun accès n'expire prochainement"
              className="h-full"
              bodyClassName="pt-1"
            >
              <ul className="divide-y divide-slate-50 dark:divide-white/5">
                {(activity.data?.expiringShares ?? []).map((share) => {
                  const daysLeft = Math.max(0, Math.ceil((parseISO(share.expiresAt).getTime() - Date.now()) / 86_400_000));
                  return (
                    <li key={share.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink dark:text-white">
                          {share.beneficiaryFirstName} {share.beneficiaryLastName}
                        </p>
                        <Link to={`/properties/${share.property.id}?tab=shares`} className="text-xs text-ink-muted hover:text-brand-600">
                          {share.property.reference}
                        </Link>
                      </div>
                      <span className={cn('rounded-pill px-2.5 py-1 text-xs font-bold text-white', daysLeft <= 7 ? 'bg-brand-400' : 'bg-success-500')}>
                        {daysLeft} j
                      </span>
                    </li>
                  );
                })}
              </ul>
            </ChartCard>
          </FadeIn>

          <FadeIn>
            <ChartCard
              title="Plus grands terrains"
              loading={properties.isLoading}
              empty={(properties.data?.largest.length ?? 0) === 0}
              className="h-full"
              bodyClassName="pt-1"
            >
              <ul className="divide-y divide-slate-50 dark:divide-white/5">
                {(properties.data?.largest ?? []).map((property, index) => (
                  <li key={property.id}>
                    <Link to={`/properties/${property.id}`} className="flex items-center gap-3 py-3 transition-colors hover:text-brand-600">
                      <span className="icon-disc h-8 w-8 text-xs font-bold">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink dark:text-white">{property.reference}</p>
                        <p className="truncate text-xs text-ink-muted">{property.location.name}</p>
                      </div>
                      <span className="tabular text-sm font-bold text-ink dark:text-white">{formatArea(property.areaSqm)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </ChartCard>
          </FadeIn>

          <FadeIn>
            <ChartCard
              title="Documents"
              subtitle={documents.data ? `${documents.data.propertyDocuments.totalVersions} versions · ${formatFileSize(documents.data.propertyDocuments.totalSizeBytes)}` : undefined}
              loading={documents.isLoading}
              empty={documentRows.length === 0}
              emptyLabel="Aucun document"
              table={<SimpleTable columns={['Type', 'Documents']} rows={documentRows.map((r) => ({ label: r.label, value: r.value }))} />}
              className="h-full"
            >
              <BarList items={documentRows} labelWidth={120} />
            </ChartCard>
          </FadeIn>
        </Stagger>
      </div>

      <p className="mt-4 text-center text-xs text-ink-muted">
        Connecté en tant que {user?.firstName} {user?.lastName} · dernière mise à jour{' '}
        {formatDate(new Date())}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sélecteur de mois — le motif « ‹ 21 22 23 24 25 › » du design de référence
// ---------------------------------------------------------------------------

function MonthPager({
  series,
  activeIndex,
  onSelect,
}: {
  series: Array<{ month: string }>;
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  if (series.length === 0) return null;

  // Fenêtre glissante de cinq mois centrée sur la sélection.
  const start = Math.max(0, Math.min(activeIndex - 2, series.length - 5));
  const visible = series.slice(start, start + 5);

  return (
    <div className="mt-5 flex items-center justify-between">
      <IconButton size="sm" disabled={activeIndex <= 0} onClick={() => onSelect(activeIndex - 1)} aria-label="Mois précédent">
        <Icon name="chevronLeft" className="h-4 w-4" />
      </IconButton>

      <div className="flex items-center gap-2">
        {visible.map((point, offset) => {
          const index = start + offset;
          const date = parseISO(`${point.month}-01`);
          const active = index === activeIndex;
          return (
            <button
              key={point.month}
              type="button"
              onClick={() => onSelect(index)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'flex h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm font-semibold capitalize transition-all',
                active
                  ? 'bg-gradient-brand text-white shadow-glow-brand'
                  : 'text-ink-muted hover:bg-slate-100 dark:hover:bg-white/5',
              )}
            >
              {format(date, 'MMM', { locale: fr }).replace('.', '')}
            </button>
          );
        })}
      </div>

      <IconButton size="sm" disabled={activeIndex >= series.length - 1} onClick={() => onSelect(activeIndex + 1)} aria-label="Mois suivant">
        <Icon name="chevronRight" className="h-4 w-4" />
      </IconButton>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Illustration de la carte d'appel à l'action : repère de carte en dégradé. */
function MapIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="pin-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
        <linearGradient id="pin-shadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ea580c" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#ea580c" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="140" rx="46" ry="12" fill="url(#pin-shadow)" />
      <path
        d="M80 14c-26 0-46 20-46 46 0 34 46 78 46 78s46-44 46-78c0-26-20-46-46-46z"
        fill="url(#pin-grad)"
      />
      <circle cx="80" cy="60" r="20" fill="white" fillOpacity="0.95" />
      <circle cx="80" cy="60" r="9" fill="#ea580c" />
    </svg>
  );
}

const ACTION_VERBS: Record<string, string> = {
  LOGIN: "s'est connecté",
  LOGOUT: "s'est déconnecté",
  CREATE: 'a créé',
  UPDATE: 'a modifié',
  DELETE: 'a supprimé',
  UPLOAD: 'a téléversé',
  DOWNLOAD: 'a téléchargé',
  SHARE: 'a partagé',
  REVOKE_SHARE: 'a révoqué un partage sur',
  VIEW: 'a consulté',
  PASSWORD_CHANGE: 'a changé son mot de passe',
};

const ENTITY_LABELS: Record<string, string> = {
  Property: 'un terrain',
  PropertyDocument: 'un document',
  PropertyGeoFile: 'un fichier Google Earth',
  PropertyShare: 'un partage',
  PropertyCoordinate: 'des coordonnées',
  PropertyManager: 'des gestionnaires',
  Project: 'un projet',
  ProjectComponent: 'une composante',
  ProjectDocument: "un dossier d'étude",
  BuildingPermit: 'un permis',
  Company: 'une entreprise',
  Location: 'une localité',
  Site: 'un site',
  User: 'un utilisateur',
  Role: 'un rôle',
};

function describeAction(entry: { action: string; entity: string; metadata: Record<string, unknown> | null }): string {
  const verb = ACTION_VERBS[entry.action] ?? entry.action.toLowerCase();
  if (['LOGIN', 'LOGOUT', 'PASSWORD_CHANGE'].includes(entry.action)) return verb;
  const reference =
    (entry.metadata?.reference as string | undefined) ??
    (entry.metadata?.propertyReference as string | undefined);
  const target = ENTITY_LABELS[entry.entity] ?? entry.entity;
  return reference ? `${verb} ${target} ${reference}` : `${verb} ${target}`;
}
