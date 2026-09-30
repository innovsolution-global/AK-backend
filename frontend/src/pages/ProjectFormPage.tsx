import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  companiesApi,
  locationsApi,
  projectsApi,
  propertiesApi,
  sitesApi,
  usersApi,
} from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { ApiError } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Alert, ErrorState, Skeleton } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { humanizeEnum } from '@/utils/format';
import { PROJECT_STATUSES } from '@/types/domain';

interface FormState {
  name: string;
  locationId: string;
  siteId: string;
  propertyId: string;
  companyId: string;
  managerId: string;
  status: string;
  startDate: string;
  expectedEndDate: string;
  actualEndDate: string;
  description: string;
  notes: string;
}

const EMPTY: FormState = {
  name: '',
  locationId: '',
  siteId: '',
  propertyId: '',
  companyId: '',
  managerId: '',
  status: 'IDEE',
  startDate: '',
  expectedEndDate: '',
  actualEndDate: '',
  description: '',
  notes: '',
};

/** Statuts qu'un projet peut porter à sa création — les autres se gagnent par transition (§17). */
const INITIAL_STATUSES = ['IDEE', 'ETUDE_PRELIMINAIRE', 'EN_ETUDE', 'CONCEPTION'] as const;

/**
 * Création et modification d'un projet (§15).
 *
 * Le statut ne se modifie pas ici en édition : il suit la machine à états et
 * passe par « Faire évoluer le statut » sur la fiche, qui trace l'historique.
 */
export default function ProjectFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isEdit = mode === 'edit';

  const { data: project, isLoading, error } = useQuery({
    queryKey: queryKeys.projects.detail(id),
    queryFn: () => projectsApi.detail(id),
    enabled: isEdit && id.length > 0,
  });

  const { data: locations } = useQuery({
    queryKey: queryKeys.locations.list({ all: true }),
    queryFn: () => locationsApi.all(),
  });

  const { data: sites } = useQuery({
    queryKey: queryKeys.sites.list({ locationId: form.locationId }),
    queryFn: () => sitesApi.list({ locationId: form.locationId, limit: 100 }),
    enabled: form.locationId.length > 0,
  });

  // Les terrains proposés sont ceux de la ville choisie : un projet s'implante
  // sur un domaine du même lieu.
  const { data: properties } = useQuery({
    queryKey: queryKeys.properties.list({ locationId: form.locationId, limit: 100, forProject: true }),
    queryFn: () => propertiesApi.list({ locationId: form.locationId, limit: 100, sort: 'reference', order: 'asc' }),
    enabled: form.locationId.length > 0,
  });

  const { data: companies } = useQuery({
    queryKey: queryKeys.companies.list({ limit: 100 }),
    queryFn: () => companiesApi.list({ limit: 100, sort: 'name', order: 'asc' }),
    enabled: can('company.read'),
  });

  // La liste des utilisateurs est réservée à `user.manage` : sans ce droit, le
  // champ « responsable » n'est pas proposé plutôt que d'échouer en 403.
  const { data: users } = useQuery({
    queryKey: queryKeys.users.list({ limit: 100, active: true }),
    queryFn: () => usersApi.list({ limit: 100, isActive: true }),
    enabled: can('user.manage'),
  });

  // Pré-remplissage : depuis la fiche du projet en édition, ou depuis un terrain
  // quand on arrive par « Nouveau projet sur ce domaine » (?propertyId=…).
  useEffect(() => {
    if (isEdit) {
      if (!project) return;
      setForm({
        name: project.name,
        locationId: project.location.id,
        siteId: project.site?.id ?? '',
        propertyId: project.property?.id ?? '',
        companyId: project.company?.id ?? '',
        managerId: project.manager?.id ?? '',
        status: project.status,
        startDate: project.startDate?.slice(0, 10) ?? '',
        expectedEndDate: project.expectedEndDate?.slice(0, 10) ?? '',
        actualEndDate: project.actualEndDate?.slice(0, 10) ?? '',
        description: project.description ?? '',
        notes: project.notes ?? '',
      });
      return;
    }

    const presetProperty = searchParams.get('propertyId');
    if (!presetProperty) return;

    void propertiesApi.detail(presetProperty).then((property) => {
      setForm((current) => ({
        ...current,
        name: current.name || `Projet ${property.name}`,
        locationId: property.location.id,
        siteId: property.site?.id ?? '',
        propertyId: property.id,
      }));
    });
  }, [isEdit, project, searchParams]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        locationId: form.locationId,
        // En édition, `null` retire le rattachement ; en création on omet.
        siteId: form.siteId || (isEdit ? null : undefined),
        propertyId: form.propertyId || (isEdit ? null : undefined),
        companyId: form.companyId || (isEdit ? null : undefined),
        managerId: form.managerId || (isEdit ? null : undefined),
        startDate: form.startDate || undefined,
        expectedEndDate: form.expectedEndDate || undefined,
        description: form.description.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };

      if (isEdit) {
        payload.actualEndDate = form.actualEndDate || undefined;
        return projectsApi.update(id, payload);
      }

      payload.status = form.status;
      return projectsApi.create(payload);
    },
    onSuccess: (result) => {
      toast.success(isEdit ? 'Projet mis à jour.' : `Projet ${result.reference} créé.`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      navigate(`/projects/${result.id}`);
    },
    onError: (caught: Error) => {
      if (caught instanceof ApiError && caught.details.length > 0) {
        const mapped: Record<string, string> = {};
        for (const detail of caught.details) {
          if (detail.field) mapped[detail.field] = detail.message;
        }
        setFieldErrors(mapped);
      }
      toast.error(caught.message);
    },
  });

  if (error) return <ErrorState error={error} />;
  if (isEdit && isLoading) return <Skeleton className="h-96" />;

  const datesInvalid =
    form.startDate !== '' &&
    form.expectedEndDate !== '' &&
    form.expectedEndDate < form.startDate;

  const canSubmit =
    form.name.trim().length >= 2 && form.locationId.length > 0 && !datesInvalid;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        icon={isEdit ? 'edit' : 'plus'}
        tone="brand"
        backTo={
          isEdit
            ? { to: `/projects/${id}`, label: 'Retour à la fiche' }
            : { to: '/projects', label: 'Projets' }
        }
        title={isEdit ? `Modifier ${project?.reference ?? ''}` : 'Nouveau projet'}
        description={
          isEdit ? undefined : 'La référence AK-PRJ-XXXXXX sera générée automatiquement.'
        }
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
        className="panel space-y-4 p-4 sm:p-6"
      >
        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold text-ink dark:text-white">Identification</h2>

          <Input
            label="Nom du projet"
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            error={fieldErrors.name}
            placeholder="Résidence Lambanyi — phase 1"
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Ville"
              value={form.locationId}
              onChange={(event) => {
                set('locationId', event.target.value);
                // Changer de ville rend le site et le terrain précédents incohérents.
                set('siteId', '');
                set('propertyId', '');
              }}
              placeholder="Sélectionner une ville"
              error={fieldErrors.locationId}
              options={(locations ?? []).map((location) => ({
                value: location.id,
                label: location.name,
              }))}
              required
            />

            <Select
              label="Site / quartier"
              value={form.siteId}
              onChange={(event) => set('siteId', event.target.value)}
              placeholder={form.locationId ? 'Aucun site' : 'Choisissez d’abord une ville'}
              disabled={!form.locationId}
              error={fieldErrors.siteId}
              options={(sites?.data ?? []).map((site) => ({
                value: site.id,
                label: site.name,
              }))}
            />
          </div>

          <Select
            label="Terrain concerné"
            value={form.propertyId}
            onChange={(event) => set('propertyId', event.target.value)}
            placeholder={
              form.locationId ? 'Aucun terrain rattaché' : 'Choisissez d’abord une ville'
            }
            disabled={!form.locationId}
            error={fieldErrors.propertyId}
            hint="Le projet apparaîtra sur la fiche du terrain et dans ses indicateurs."
            options={(properties?.data ?? []).map((property) => ({
              value: property.id,
              label: `${property.reference} — ${property.name}`,
            }))}
          />
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold text-ink dark:text-white">Pilotage</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            {can('company.read') && (
              <Select
                label="Entreprise"
                value={form.companyId}
                onChange={(event) => set('companyId', event.target.value)}
                placeholder="Aucune entreprise"
                error={fieldErrors.companyId}
                options={(companies?.data ?? []).map((company) => ({
                  value: company.id,
                  label: company.name,
                }))}
              />
            )}

            {can('user.manage') && (
              <Select
                label="Responsable"
                value={form.managerId}
                onChange={(event) => set('managerId', event.target.value)}
                placeholder="Aucun responsable désigné"
                error={fieldErrors.managerId}
                options={(users?.data ?? [])
                  .filter((user) => user.isActive)
                  .map((user) => ({
                    value: user.id,
                    label: `${user.firstName} ${user.lastName}`,
                  }))}
              />
            )}
          </div>

          {!isEdit ? (
            <Select
              label="Statut initial"
              value={form.status}
              onChange={(event) => set('status', event.target.value)}
              hint="Les étapes suivantes se franchissent depuis la fiche, avec historique."
              options={PROJECT_STATUSES.filter((status) =>
                (INITIAL_STATUSES as readonly string[]).includes(status),
              ).map((status) => ({ value: status, label: humanizeEnum(status) }))}
            />
          ) : (
            <Alert tone="info">
              Le statut (<strong>{humanizeEnum(form.status)}</strong>) se modifie depuis la fiche
              du projet, par « Faire évoluer le statut », afin de conserver l’historique.
            </Alert>
          )}
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold text-ink dark:text-white">Calendrier</h2>

          <div className={`grid gap-4 ${isEdit ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            <Input
              label="Début"
              type="date"
              value={form.startDate}
              onChange={(event) => set('startDate', event.target.value)}
              error={fieldErrors.startDate}
            />
            <Input
              label="Fin prévue"
              type="date"
              value={form.expectedEndDate}
              onChange={(event) => set('expectedEndDate', event.target.value)}
              error={
                fieldErrors.expectedEndDate ??
                (datesInvalid ? 'La fin prévue précède le début.' : undefined)
              }
            />
            {isEdit && (
              <Input
                label="Fin réelle"
                type="date"
                value={form.actualEndDate}
                onChange={(event) => set('actualEndDate', event.target.value)}
                error={fieldErrors.actualEndDate}
              />
            )}
          </div>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold text-ink dark:text-white">Compléments</h2>

          <Textarea
            label="Description"
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
            rows={3}
            placeholder="Objet du projet, programme, contraintes connues…"
          />

          <Textarea
            label="Notes internes"
            value={form.notes}
            onChange={(event) => set('notes', event.target.value)}
            hint="Réservées à l’équipe."
            rows={3}
          />
        </section>

        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => navigate(isEdit ? `/projects/${id}` : '/projects')}
          >
            Annuler
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!canSubmit}>
            {isEdit ? 'Enregistrer' : 'Créer le projet'}
          </Button>
        </div>
      </form>
    </div>
  );
}
