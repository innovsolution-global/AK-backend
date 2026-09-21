import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { propertiesApi, sharesApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ConfirmDialog } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatDateTime } from '@/utils/format';
import { ShareFormModal } from './ShareFormModal';

interface SharesPanelProps {
  propertyId: string;
  propertyReference: string;
}

export function SharesPanel({ propertyId, propertyReference }: SharesPanelProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [toRevoke, setToRevoke] = useState<{ id: string; email: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.properties.shares(propertyId),
    queryFn: () => propertiesApi.shares(propertyId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.properties.shares(propertyId),
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.shares.all });
  };

  const revoke = useMutation({
    mutationFn: (shareId: string) => sharesApi.revoke(propertyId, shareId),
    onSuccess: () => {
      toast.success('Accès révoqué. La session du bénéficiaire est close.');
      setToRevoke(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resend = useMutation({
    mutationFn: (shareId: string) => sharesApi.resend(propertyId, shareId),
    onSuccess: () => {
      toast.success('Invitation renvoyée. L’ancien lien n’est plus valable.');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <Skeleton className="h-64" />;

  const shares = data ?? [];
  const active = shares.filter((share) => share.status === 'ACTIVE').length;

  return (
    <div className="space-y-5">
      <Alert tone="info">
        Un bénéficiaire ne voit que ce bien : ni les autres terrains, ni les
        projets, ni les informations internes. Vous pouvez révoquer son accès à
        tout moment, avec effet immédiat.
      </Alert>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-ink dark:text-white">
              Partages ({shares.length})
            </h2>
            <p className="text-xs text-ink-muted">
              {active} accès actif{active > 1 ? 's' : ''}
            </p>
          </div>
          <Button
            size="sm"
            icon={<Icon name="share" className="h-4 w-4" />}
            onClick={() => setFormOpen(true)}
          >
            Partager le bien
          </Button>
        </div>

        {shares.length === 0 ? (
          <EmptyState
            title="Aucun partage"
            description="Donnez un accès temporaire et limité à un tiers."
            icon={<Icon name="share" className="h-10 w-10" />}
            action={<Button onClick={() => setFormOpen(true)}>Partager le bien</Button>}
          />
        ) : (
          <ul className="divide-y divide-slate-50 dark:divide-white/5">
            {shares.map((share) => {
              const canRevoke =
                share.status === 'PENDING' || share.status === 'ACTIVE';

              return (
                <li key={share.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-ink dark:text-white">
                          {share.beneficiaryFirstName} {share.beneficiaryLastName}
                        </p>
                        <StatusBadge status={share.status} kind="share" />
                      </div>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {share.beneficiaryEmail}
                        {share.beneficiaryPhone && ` · ${share.beneficiaryPhone}`}
                      </p>

                      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-muted">
                        <span>Expire le {formatDate(share.expiresAt)}</span>
                        {share.activatedAt && (
                          <span>Activé le {formatDate(share.activatedAt)}</span>
                        )}
                        {share.lastAccessedAt && (
                          <span>
                            Dernière consultation {formatDateTime(share.lastAccessedAt)}
                          </span>
                        )}
                        {share.revokedAt && (
                          <span className="text-red-600 dark:text-red-400">
                            Révoqué le {formatDate(share.revokedAt)}
                          </span>
                        )}
                      </dl>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Capability enabled={share.allowCoordinates} label="Coordonnées" />
                        <Capability enabled={share.allowGoogleEarth} label="Google Earth" />
                        <Capability
                          enabled={share.allowDocuments}
                          label={`Documents (${share.documents.length})`}
                        />
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {share.status === 'PENDING' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={resend.isPending}
                          onClick={() => resend.mutate(share.id)}
                        >
                          Renvoyer
                        </Button>
                      )}
                      {canRevoke && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setToRevoke({
                              id: share.id,
                              email: share.beneficiaryEmail,
                            })
                          }
                        >
                          Révoquer
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ShareFormModal
        propertyId={propertyId}
        propertyReference={propertyReference}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={invalidate}
      />

      <ConfirmDialog
        open={toRevoke !== null}
        onClose={() => setToRevoke(null)}
        onConfirm={() => toRevoke && revoke.mutate(toRevoke.id)}
        loading={revoke.isPending}
        destructive
        title="Révoquer cet accès ?"
        description={`${toRevoke?.email ?? ''} perdra immédiatement l'accès au bien ${propertyReference}. Sa session en cours sera fermée sans délai.`}
        confirmLabel="Révoquer"
      />
    </div>
  );
}

function Capability({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <span
      className={
        enabled
          ? 'rounded bg-success-50 dark:bg-success-500/10 px-1.5 py-0.5 text-[11px] font-medium text-success-700 dark:text-success-400'
          : 'rounded bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 text-[11px] text-ink-muted line-through'
      }
    >
      {label}
    </span>
  );
}
