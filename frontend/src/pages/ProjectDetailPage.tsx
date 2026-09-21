import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiRow, KpiSlot, Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { Select, Textarea } from '@/components/ui/Field';
import { Alert, ErrorState, Skeleton } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { formatDate, formatDateTime, humanizeEnum } from '@/utils/format';
import { PROJECT_STATUSES } from '@/types/domain';

export default function ProjectDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const [statusOpen, setStatusOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.projects.detail(id),
    queryFn: () => projectsApi.detail(id),
    enabled: id.length > 0,
  });

  const { data: history } = useQuery({
    queryKey: queryKeys.projects.history(id),
    queryFn: () => projectsApi.statusHistory(id),
    enabled: id.length > 0,
  });

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        icon="project"
        backTo={{ to: '/projects', label: 'Projets' }}
        title={data.reference}
        description={data.name}
        actions={
          can('project.update') && (
            <Button size="lg" icon={<Icon name="trendUp" className="h-5 w-5" />} onClick={() => setStatusOpen(true)}>
              Faire évoluer le statut
            </Button>
          )
        }
      />

      <Panel>
      <KpiRow>
        <KpiSlot>
          <div className="card flex items-center gap-5 p-5">
            <div className="icon-disc h-[76px] w-[76px]">
              <Icon name="sparkles" className="h-8 w-8" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-medium text-ink-muted">Statut</p>
              <div className="mt-2">
                <StatusBadge status={data.status} kind="project" className="px-3.5 py-1.5 text-sm" />
              </div>
            </div>
          </div>
        </KpiSlot>
        <KpiSlot>
          <div className="card flex items-center gap-5 p-5">
            <div className="icon-disc h-[76px] w-[76px]">
              <Icon name="site" className="h-8 w-8" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-medium text-ink-muted">Implantation</p>
              <p className="mt-0.5 truncate text-xl font-extrabold text-ink dark:text-white">{data.location.name}</p>
              <p className="truncate text-sm text-ink-muted">{data.site?.name ?? 'Sans site rattaché'}</p>
            </div>
          </div>
        </KpiSlot>
        <KpiSlot>
          {data.property ? (
            <Link to={`/properties/${data.property.id}`} className="card flex items-center gap-5 p-5 transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
              <div className="icon-disc h-[76px] w-[76px]">
                <Icon name="land" className="h-8 w-8" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-medium text-ink-muted">Domaine associé</p>
                <p className="mt-0.5 truncate text-xl font-extrabold text-ink dark:text-white">{data.property.reference}</p>
                <p className="truncate text-sm text-brand-600 dark:text-brand-400">Ouvrir la fiche →</p>
              </div>
            </Link>
          ) : (
            <div className="card flex items-center gap-5 p-5">
              <div className="icon-disc h-[76px] w-[76px]">
                <Icon name="land" className="h-8 w-8" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-medium text-ink-muted">Domaine associé</p>
                <p className="mt-0.5 text-xl font-extrabold text-ink-muted">Aucun</p>
              </div>
            </div>
          )}
        </KpiSlot>
      </KpiRow>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="card p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink dark:text-white">
              Informations
            </h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Entreprise" value={data.company?.name} />
              <Detail
                label="Responsable"
                value={
                  data.manager
                    ? `${data.manager.firstName} ${data.manager.lastName}`
                    : undefined
                }
              />
              <Detail label="Début" value={formatDate(data.startDate)} />
              <Detail label="Fin prévue" value={formatDate(data.expectedEndDate)} />
              <Detail label="Fin réelle" value={formatDate(data.actualEndDate)} />
            </dl>

            {data.description && (
              <div className="mt-5 border-t border-slate-100 dark:border-white/5 pt-4">
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Description
                </dt>
                <dd className="mt-1 whitespace-pre-line text-sm text-ink-soft dark:text-slate-300">
                  {data.description}
                </dd>
              </div>
            )}
          </section>

          <section className="card overflow-hidden">
            <div className="border-b border-slate-100 dark:border-white/5 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink dark:text-white">
                Composantes ({data.components.length})
              </h2>
            </div>

            {data.components.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-muted">
                Aucune composante déclarée.
              </p>
            ) : (
              <ul className="divide-y divide-slate-50 dark:divide-white/5">
                {data.components.map((component) => (
                  <li key={component.id} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink dark:text-white">
                          {component.name}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {humanizeEnum(component.type)}
                          {component.area &&
                            ` · ${component.area} ${component.areaUnit ?? ''}`}
                        </p>
                        {component.description && (
                          <p className="mt-1 text-sm text-ink-soft dark:text-slate-300">
                            {component.description}
                          </p>
                        )}
                      </div>
                      <StatusBadge status={component.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card overflow-hidden">
            <div className="border-b border-slate-100 dark:border-white/5 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink dark:text-white">
                Permis de construire ({data.permits.length})
              </h2>
            </div>

            {data.permits.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-muted">
                Aucun permis enregistré.
              </p>
            ) : (
              <ul className="divide-y divide-slate-50 dark:divide-white/5">
                {data.permits.map((permit) => (
                  <li
                    key={permit.id}
                    className="flex items-center justify-between gap-3 px-5 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink dark:text-white">
                        {permit.number}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {permit.authority ?? 'Autorité non précisée'} · émis le{' '}
                        {formatDate(permit.issueDate)} · expire le{' '}
                        {formatDate(permit.expiryDate)}
                      </p>
                    </div>
                    <StatusBadge status={permit.status} kind="permit" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div>
          <section className="card overflow-hidden">
            <div className="border-b border-slate-100 dark:border-white/5 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink dark:text-white">
                Historique des statuts
              </h2>
              <p className="text-xs text-ink-muted">
                Conservé intégralement, jamais écrasé.
              </p>
            </div>

            <ol className="divide-y divide-slate-50 dark:divide-white/5">
              {(history ?? []).map((entry) => (
                <li key={entry.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {entry.fromStatus && (
                      <>
                        <span className="text-xs text-ink-muted">
                          {humanizeEnum(entry.fromStatus)}
                        </span>
                        <Icon name="chevronRight" className="h-3 w-3 text-ink-muted" />
                      </>
                    )}
                    <StatusBadge status={entry.toStatus} kind="project" />
                  </div>
                  {entry.comment && (
                    <p className="mt-1.5 text-sm text-ink-soft dark:text-slate-300">{entry.comment}</p>
                  )}
                  <p className="mt-1 text-xs text-ink-muted">
                    {entry.changedBy
                      ? `${entry.changedBy.firstName} ${entry.changedBy.lastName}`
                      : 'Système'}{' '}
                    · {formatDateTime(entry.changedAt)}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
      </Panel>

      <ChangeStatusModal
        projectId={id}
        currentStatus={data.status}
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
      />
    </div>
  );
}

function ChangeStatusModal({
  projectId,
  currentStatus,
  open,
  onClose,
}: {
  projectId: string;
  currentStatus: string;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [comment, setComment] = useState('');

  const change = useMutation({
    mutationFn: () => projectsApi.changeStatus(projectId, status, comment || undefined),
    onSuccess: () => {
      toast.success('Statut mis à jour.');
      setStatus('');
      setComment('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      onClose();
    },
    // Les transitions incohérentes sont refusées par le backend, qui liste les
    // suites possibles : son message est plus utile que tout texte générique.
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Faire évoluer le statut"
      description={`Statut actuel : ${humanizeEnum(currentStatus)}. Le changement est enregistré dans l'historique.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            loading={change.isPending}
            disabled={!status}
            onClick={() => change.mutate()}
          >
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Nouveau statut"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          placeholder="Sélectionner…"
          options={PROJECT_STATUSES.filter((value) => value !== currentStatus).map(
            (value) => ({ value, label: humanizeEnum(value) }),
          )}
          required
        />

        <Textarea
          label="Motif"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Facultatif — conservé dans l'historique"
          rows={3}
        />

        <Alert tone="info">
          Toutes les transitions ne sont pas permises : un projet terminé ou
          abandonné ne peut plus évoluer.
        </Alert>
      </div>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-ink dark:text-white">{value || '—'}</dd>
    </div>
  );
}
