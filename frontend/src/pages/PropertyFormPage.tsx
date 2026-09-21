import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { locationsApi, propertiesApi, sitesApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { ApiError } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Alert, ErrorState, Skeleton } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { humanizeEnum } from '@/utils/format';
import { AREA_UNITS, PROPERTY_STATUSES } from '@/types/domain';

interface FormState {
  name: string;
  locationId: string;
  siteId: string;
  area: string;
  areaUnit: string;
  status: string;
  purchaseDate: string;
  sellerName: string;
  sellerContact: string;
  description: string;
  notes: string;
  googleMapsUrl: string;
  googleEarthUrl: string;
  latitude: string;
  longitude: string;
}

const EMPTY: FormState = {
  name: '',
  locationId: '',
  siteId: '',
  area: '',
  areaUnit: 'M2',
  status: 'NON_AMENAGE',
  purchaseDate: '',
  sellerName: '',
  sellerContact: '',
  description: '',
  notes: '',
  googleMapsUrl: '',
  googleEarthUrl: '',
  latitude: '',
  longitude: '',
};

export default function PropertyFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isEdit = mode === 'edit';

  const { data: property, isLoading, error } = useQuery({
    queryKey: queryKeys.properties.detail(id),
    queryFn: () => propertiesApi.detail(id),
    enabled: isEdit && id.length > 0,
  });

  const { data: locations } = useQuery({
    queryKey: queryKeys.locations.list({ type: 'VILLE' }),
    queryFn: () => locationsApi.list({ limit: 100, type: 'VILLE' }),
  });

  // Les sites dépendent de la ville : la liste se recharge à chaque changement,
  // ce qui évite de proposer un quartier d'une autre ville — le backend le
  // refuserait.
  const { data: sites } = useQuery({
    queryKey: queryKeys.sites.list({ locationId: form.locationId }),
    queryFn: () => sitesApi.list({ locationId: form.locationId, limit: 100 }),
    enabled: form.locationId.length > 0,
  });

  useEffect(() => {
    if (!property) return;

    const primary = property.coordinates.find((point) => point.isPrimary);

    setForm({
      name: property.name,
      locationId: property.location.id,
      siteId: property.site?.id ?? '',
      area: String(property.area),
      areaUnit: property.areaUnit,
      status: property.status,
      purchaseDate: property.purchaseDate?.slice(0, 10) ?? '',
      sellerName: property.sellerName ?? '',
      sellerContact: property.sellerContact ?? '',
      description: property.description ?? '',
      notes: property.notes ?? '',
      googleMapsUrl: property.googleMapsUrl ?? '',
      googleEarthUrl: property.googleEarthUrl ?? '',
      latitude: primary ? String(primary.latitude) : '',
      longitude: primary ? String(primary.longitude) : '',
    });
  }, [property]);

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
        siteId: form.siteId || undefined,
        area: Number(form.area),
        areaUnit: form.areaUnit,
        status: form.status,
        purchaseDate: form.purchaseDate || undefined,
        sellerName: form.sellerName.trim() || undefined,
        sellerContact: form.sellerContact.trim() || undefined,
        description: form.description.trim() || undefined,
        notes: form.notes.trim() || undefined,
        googleMapsUrl: form.googleMapsUrl.trim() || undefined,
        googleEarthUrl: form.googleEarthUrl.trim() || undefined,
      };

      const hasCoordinates = form.latitude !== '' && form.longitude !== '';

      if (!isEdit && hasCoordinates) {
        payload.coordinates = [
          {
            label: 'Point principal',
            latitude: Number(form.latitude),
            longitude: Number(form.longitude),
            isPrimary: true,
          },
        ];
      }

      const result = isEdit
        ? await propertiesApi.update(id, payload)
        : await propertiesApi.create(payload);

      // En édition, les coordonnées passent par leur propre endpoint : le PATCH
      // du terrain ne les accepte pas.
      if (isEdit && hasCoordinates) {
        await propertiesApi.replaceCoordinates(id, [
          {
            label: 'Point principal',
            latitude: Number(form.latitude),
            longitude: Number(form.longitude),
            isPrimary: true,
          },
        ]);
      }

      return result;
    },
    onSuccess: (result) => {
      toast.success(isEdit ? 'Terrain mis à jour.' : `Terrain ${result.reference} créé.`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.properties.all });
      navigate(`/properties/${result.id}`);
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

  const canSubmit =
    form.name.trim().length >= 2 &&
    form.locationId.length > 0 &&
    Number(form.area) > 0;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        icon={isEdit ? 'edit' : 'plus'}
        tone="brand"
        backTo={
          isEdit
            ? { to: `/properties/${id}`, label: 'Retour à la fiche' }
            : { to: '/properties', label: 'Terrains' }
        }
        title={isEdit ? `Modifier ${property?.reference ?? ''}` : 'Nouveau terrain'}
        description={
          isEdit
            ? undefined
            : 'La référence AK-IMM-XXXXXX sera générée automatiquement.'
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
            label="Nom du domaine"
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            error={fieldErrors.name}
            placeholder="Domaine Lambanyi 1"
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Ville"
              value={form.locationId}
              onChange={(event) => {
                set('locationId', event.target.value);
                // Changer de ville rend le site précédent incohérent.
                set('siteId', '');
              }}
              placeholder="Sélectionner une ville"
              error={fieldErrors.locationId}
              options={(locations?.data ?? []).map((location) => ({
                value: location.id,
                label: location.name,
              }))}
              required
            />

            <Select
              label="Site / quartier"
              value={form.siteId}
              onChange={(event) => set('siteId', event.target.value)}
              placeholder={
                form.locationId ? 'Aucun site' : 'Choisissez d’abord une ville'
              }
              disabled={!form.locationId}
              error={fieldErrors.siteId}
              options={(sites?.data ?? []).map((site) => ({
                value: site.id,
                label: site.name,
              }))}
            />
          </div>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold text-ink dark:text-white">Caractéristiques</h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Superficie"
              type="number"
              step="0.01"
              min="0"
              value={form.area}
              onChange={(event) => set('area', event.target.value)}
              error={fieldErrors.area}
              required
              wrapperClassName="sm:col-span-2"
            />

            <Select
              label="Unité"
              value={form.areaUnit}
              onChange={(event) => set('areaUnit', event.target.value)}
              options={AREA_UNITS.map((unit) => ({
                value: unit,
                label: unit === 'M2' ? 'm²' : unit === 'ARE' ? 'are' : 'hectare',
              }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Statut"
              value={form.status}
              onChange={(event) => set('status', event.target.value)}
              options={PROPERTY_STATUSES.map((status) => ({
                value: status,
                label: humanizeEnum(status),
              }))}
            />

            <Input
              label="Date d'acquisition"
              type="date"
              value={form.purchaseDate}
              onChange={(event) => set('purchaseDate', event.target.value)}
              error={fieldErrors.purchaseDate}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Sessionnaire / vendeur"
              value={form.sellerName}
              onChange={(event) => set('sellerName', event.target.value)}
            />
            <Input
              label="Contact du vendeur"
              value={form.sellerContact}
              onChange={(event) => set('sellerContact', event.target.value)}
            />
          </div>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold text-ink dark:text-white">Localisation</h2>

          <Alert tone="info">
            Sans coordonnées, le terrain n'apparaîtra pas sur la carte. Les bornes
            complémentaires s'ajoutent depuis la fiche.
          </Alert>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Latitude"
              type="number"
              step="0.0000001"
              value={form.latitude}
              onChange={(event) => set('latitude', event.target.value)}
              placeholder="9.6412"
              error={fieldErrors.latitude}
            />
            <Input
              label="Longitude"
              type="number"
              step="0.0000001"
              value={form.longitude}
              onChange={(event) => set('longitude', event.target.value)}
              placeholder="-13.5784"
              error={fieldErrors.longitude}
            />
          </div>

          <Input
            label="Lien Google Maps"
            value={form.googleMapsUrl}
            onChange={(event) => set('googleMapsUrl', event.target.value)}
            placeholder="https://maps.google.com/?q=…"
          />
          <Input
            label="Lien Google Earth"
            value={form.googleEarthUrl}
            onChange={(event) => set('googleEarthUrl', event.target.value)}
          />
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold text-ink dark:text-white">Compléments</h2>

          <Textarea
            label="Description"
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
            rows={3}
          />

          <Textarea
            label="Notes internes"
            value={form.notes}
            onChange={(event) => set('notes', event.target.value)}
            hint="Jamais visibles par un bénéficiaire de partage."
            rows={3}
          />
        </section>

        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => navigate(isEdit ? `/properties/${id}` : '/properties')}
          >
            Annuler
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!canSubmit}>
            {isEdit ? 'Enregistrer' : 'Créer le terrain'}
          </Button>
        </div>
      </form>
    </div>
  );
}
