import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { locationsApi, sitesApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { ApiError } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

interface SiteFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Ville pré-sélectionnée : celle du filtre de la liste, s'il y en a un. */
  defaultLocationId?: string;
}

/**
 * Création d'un site ou quartier (§6).
 *
 * Contrairement aux villes, les quartiers ne relèvent d'aucun référentiel
 * officiel exploitable : ils se saisissent à la main, rattachés à leur ville.
 */
export function SiteFormModal({ open, onClose, defaultLocationId }: SiteFormModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    locationId: '',
    name: '',
    code: '',
    description: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const locations = useQuery({
    queryKey: queryKeys.locations.list({ all: true }),
    queryFn: () => locationsApi.all(),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setForm({ locationId: defaultLocationId ?? '', name: '', code: '', description: '' });
    setFieldErrors({});
  }, [open, defaultLocationId]);

  const create = useMutation({
    mutationFn: () =>
      sitesApi.create({
        locationId: form.locationId,
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        description: form.description.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(`Site « ${form.name.trim()} » créé.`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.sites.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      onClose();
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

  const city = (locations.data ?? []).find((location) => location.id === form.locationId);

  /**
   * Code proposé : préfixe de la ville + nom du quartier, ce qui donne
   * « CKY-LAMB » — lisible dans une liste et unique dans les faits.
   */
  const suggestCode = (cityCode: string | undefined, name: string) => {
    const slug = name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 6);
    if (!slug) return '';
    return cityCode ? `${cityCode}-${slug}` : slug;
  };

  const canSubmit =
    form.locationId.length > 0 && form.name.trim().length >= 2 && form.code.trim().length >= 2;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nouveau site"
      description="Quartier, zone ou lieu-dit rattaché à une ville."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={create.isPending} disabled={!canSubmit} onClick={() => create.mutate()}>
            Créer le site
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Ville"
          value={form.locationId}
          onChange={(event) => {
            const locationId = event.target.value;
            const next = (locations.data ?? []).find((location) => location.id === locationId);
            setForm((current) => ({
              ...current,
              locationId,
              code: current.name ? suggestCode(next?.code, current.name) : current.code,
            }));
            setFieldErrors({});
          }}
          placeholder={locations.isLoading ? 'Chargement…' : 'Sélectionner une ville'}
          options={(locations.data ?? []).map((location) => ({
            value: location.id,
            label: location.code ? `${location.name} (${location.code})` : location.name,
          }))}
          error={fieldErrors.locationId}
          required
        />

        <Input
          label="Nom du site / quartier"
          value={form.name}
          onChange={(event) => {
            const name = event.target.value;
            setForm((current) => ({
              ...current,
              name,
              // Le code suit le nom tant que l'utilisateur ne l'a pas retouché.
              code:
                current.code === '' || current.code === suggestCode(city?.code, current.name)
                  ? suggestCode(city?.code, name)
                  : current.code,
            }));
            setFieldErrors({});
          }}
          error={fieldErrors.name}
          placeholder="Lambanyi, Kipé, Nongo…"
          required
          autoFocus
        />

        <Input
          label="Code"
          value={form.code}
          onChange={(event) =>
            setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
          }
          error={fieldErrors.code}
          hint="Unique dans toute l’application ; proposé à partir de la ville et du nom."
          required
        />

        <Textarea
          label="Description"
          value={form.description}
          onChange={(event) =>
            setForm((current) => ({ ...current, description: event.target.value }))
          }
          rows={2}
        />
      </div>
    </Modal>
  );
}
