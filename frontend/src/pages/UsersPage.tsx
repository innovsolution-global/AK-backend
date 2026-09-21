import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Input, Select } from '@/components/ui/Field';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Alert, EmptyState, ErrorState } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { DataTable } from '@/components/data/DataTable';
import { Pagination } from '@/components/data/Pagination';
import { useAuth } from '@/hooks/useAuth';
import { useListParams } from '@/hooks/useListParams';
import { formatDateTime, formatRelative } from '@/utils/format';

const ASSIGNABLE_ROLES = ['ADMIN', 'GESTIONNAIRE', 'CONSULTANT'];

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { params, update, setPage } = useListParams({ sort: 'createdAt' });

  const [createOpen, setCreateOpen] = useState(false);
  const [toToggle, setToToggle] = useState<{ id: string; email: string; active: boolean } | null>(
    null,
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.users.list(params),
    queryFn: () => usersApi.list(params),
    placeholderData: (previous) => previous,
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      usersApi.setActive(id, active),
    onSuccess: (_, variables) => {
      toast.success(variables.active ? 'Compte réactivé.' : 'Compte désactivé.');
      setToToggle(null);
      invalidate();
    },
    onError: (caught: Error) => toast.error(caught.message),
  });

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div>
      <PageHeader
        icon="users"
        title="Utilisateurs"
        description={data ? `${data.meta.total} compte(s)` : 'Gestion des accès à la plateforme'}
        actions={
          <Button size="lg" icon={<Icon name="plus" className="h-5 w-5" />} onClick={() => setCreateOpen(true)}>
            Nouvel utilisateur
          </Button>
        }
      />

      <Panel>
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 p-5 sm:flex-row">
          <input
            type="search"
            defaultValue={params.search ?? ''}
            onChange={(event) => update({ search: event.target.value })}
            placeholder="Nom ou email…"
            className="pill-outline h-11 flex-1 px-5 text-sm placeholder:text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />

          <select
            value={String(params.role ?? '')}
            onChange={(event) => update({ role: event.target.value })}
            className="pill-outline h-11 px-4 text-sm font-medium"
          >
            <option value="">Tous les rôles</option>
            {[...ASSIGNABLE_ROLES, 'UTILISATEUR_PARTAGE'].map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>

        <DataTable
          columns={[
            {
              key: 'name',
              header: 'Utilisateur',
              render: (row) => (
                <div>
                  <p className="font-medium text-ink dark:text-white">
                    {row.firstName} {row.lastName}
                    {row.id === currentUser?.id && (
                      <span className="ml-2 text-xs text-ink-muted">(vous)</span>
                    )}
                  </p>
                  <p className="text-xs text-ink-muted">{row.email}</p>
                </div>
              ),
            },
            {
              key: 'roles',
              header: 'Rôles',
              render: (row) => (
                <div className="flex flex-wrap gap-1">
                  {row.roles.map((role) => (
                    <span
                      key={role}
                      className="rounded bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-ink-soft dark:text-slate-300"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              ),
            },
            {
              key: 'isActive',
              header: 'État',
              render: (row) =>
                row.isActive ? (
                  <span className="rounded bg-success-50 dark:bg-success-500/10 px-2 py-0.5 text-xs font-medium text-success-700 dark:text-success-400">
                    Actif
                  </span>
                ) : (
                  <span className="rounded bg-slate-100 dark:bg-white/10 px-2 py-0.5 text-xs font-medium text-ink-soft dark:text-slate-300">
                    Désactivé
                  </span>
                ),
            },
            {
              key: 'lastLoginAt',
              header: 'Dernière connexion',
              align: 'right',
              render: (row) =>
                row.lastLoginAt ? (
                  <span className="text-xs text-ink-soft dark:text-slate-300">
                    {formatRelative(row.lastLoginAt)}
                  </span>
                ) : (
                  <span className="text-xs text-ink-muted">Jamais</span>
                ),
            },
            {
              key: 'createdAt',
              header: 'Créé le',
              align: 'right',
              render: (row) => (
                <span className="text-xs text-ink-muted">
                  {formatDateTime(row.createdAt)}
                </span>
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) =>
                row.id === currentUser?.id ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setToToggle({
                        id: row.id,
                        email: row.email,
                        active: !row.isActive,
                      })
                    }
                  >
                    {row.isActive ? 'Désactiver' : 'Réactiver'}
                  </Button>
                ),
            },
          ]}
          rows={data?.data ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          empty={
            <EmptyState
              title="Aucun utilisateur"
              icon={<Icon name="users" className="h-10 w-10" />}
            />
          }
        />

        {data && <Pagination meta={data.meta} onPageChange={setPage} />}
      </div>
      </Panel>

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={invalidate}
      />

      <ConfirmDialog
        open={toToggle !== null}
        onClose={() => setToToggle(null)}
        onConfirm={() =>
          toToggle && setActive.mutate({ id: toToggle.id, active: toToggle.active })
        }
        loading={setActive.isPending}
        destructive={toToggle?.active === false}
        title={toToggle?.active ? 'Réactiver ce compte ?' : 'Désactiver ce compte ?'}
        description={
          toToggle?.active
            ? `${toToggle.email} pourra de nouveau se connecter.`
            : `${toToggle?.email ?? ''} ne pourra plus se connecter et ses sessions en cours seront fermées immédiatement.`
        }
        confirmLabel={toToggle?.active ? 'Réactiver' : 'Désactiver'}
      />
    </div>
  );
}

function CreateUserModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('GESTIONNAIRE');

  const create = useMutation({
    mutationFn: () =>
      usersApi.create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        roles: [role],
      }),
    onSuccess: () => {
      toast.success(`Invitation envoyée à ${email}.`);
      setFirstName('');
      setLastName('');
      setEmail('');
      onCreated();
      onClose();
    },
    onError: (caught: Error) => toast.error(caught.message),
  });

  const canSubmit =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    /\S+@\S+\.\S+/.test(email);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Créer un utilisateur"
      description="Le compte est créé inactif : l'utilisateur définira son mot de passe depuis le lien reçu par email."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            loading={create.isPending}
            disabled={!canSubmit}
            onClick={() => create.mutate()}
          >
            Créer et inviter
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Prénom"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            required
          />
          <Input
            label="Nom"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            required
          />
        </div>

        <Input
          label="Adresse email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <Select
          label="Rôle"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          options={ASSIGNABLE_ROLES.map((value) => ({ value, label: value }))}
          required
        />

        <Alert tone="info">
          Le rôle <strong>UTILISATEUR PARTAGÉ</strong> ne s'attribue pas ici : il
          est réservé aux comptes créés par l'activation d'un partage.
        </Alert>
      </div>
    </Modal>
  );
}
