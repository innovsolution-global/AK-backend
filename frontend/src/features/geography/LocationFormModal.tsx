import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { locationsApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { ApiError } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import type { GuineaReference, LocationType } from '@/types/domain';

interface LocationFormModalProps {
  open: boolean;
  onClose: () => void;
}

const TYPES: Array<{ value: LocationType; label: string }> = [
  { value: 'PREFECTURE', label: 'Préfecture' },
  { value: 'VILLE', label: 'Ville' },
  { value: 'COMMUNE', label: 'Commune' },
];

/** Code court proposé à partir du nom : sans accents, en majuscules. */
function suggestCode(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 3);
}

/**
 * Création d'une localité (§6).
 *
 * Le découpage administratif officiel de la Guinée est proposé en premier :
 * choisir « Télimélé » dans la liste évite les fautes de frappe, les doublons
 * (« Nzerekore » / « N'zérékoré ») et donne d'emblée la région et un code
 * stable. La saisie libre reste possible pour une localité hors référentiel.
 */
export function LocationFormModal({ open, onClose }: LocationFormModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<'reference' | 'manual'>('reference');
  const [region, setRegion] = useState('');
  const [selected, setSelected] = useState('');
  const [form, setForm] = useState({
    name: '',
    code: '',
    type: 'VILLE' as LocationType,
    region: '',
    description: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const reference = useQuery({
    queryKey: queryKeys.locations.reference(),
    queryFn: locationsApi.reference,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setMode('reference');
    setRegion('');
    setSelected('');
    setForm({ name: '', code: '', type: 'VILLE', region: '', description: '' });
    setFieldErrors({});
  }, [open]);

  const missing = useMemo(
    () => (reference.data?.localities ?? []).filter((locality) => locality.existingId === null),
    [reference.data],
  );

  const regions = useMemo(() => {
    const available = new Set(missing.map((locality) => locality.region));
    return (reference.data?.regions ?? []).filter((name) => available.has(name));
  }, [missing, reference.data]);

  const choices = region ? missing.filter((locality) => locality.region === region) : missing;
  const chosen = missing.find((locality) => locality.code === selected);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  };

  const create = useMutation({
    mutationFn: () => {
      if (mode === 'reference') {
        if (!chosen) throw new Error('Sélectionnez une localité.');
        return locationsApi.create({
          name: chosen.name,
          code: chosen.code,
          type: chosen.type,
          region: chosen.region,
          // Le rattachement d'une commune à sa ville se fait ensuite : l'import
          // du référentiel complet l'établit automatiquement.
        });
      }

      return locationsApi.create({
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        type: form.type,
        region: form.region.trim() || undefined,
        description: form.description.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success(
        mode === 'reference'
          ? `${chosen?.name ?? 'Localité'} ajoutée au référentiel.`
          : `${form.name.trim()} ajoutée au référentiel.`,
      );
      invalidate();
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

  const importAll = useMutation({
    mutationFn: locationsApi.importReference,
    onSuccess: (result) => {
      toast.success(
        result.created > 0
          ? `${result.created} localité(s) importée(s) ; ${result.skipped} déjà présente(s).`
          : 'Le référentiel officiel est déjà complet.',
      );
      invalidate();
      void reference.refetch();
      if (result.created > 0) onClose();
    },
    onError: (caught: Error) => toast.error(caught.message),
  });

  const canSubmit =
    mode === 'reference'
      ? Boolean(chosen)
      : form.name.trim().length >= 2 && form.code.trim().length >= 2;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nouvelle ville"
      description="Préfecture, ville ou commune du découpage administratif guinéen."
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button
            variant="ghost"
            loading={importAll.isPending}
            onClick={() => importAll.mutate()}
            title="Ajouter en une fois toutes les localités officielles absentes"
          >
            Importer tout le référentiel
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button loading={create.isPending} disabled={!canSubmit} onClick={() => create.mutate()}>
              Ajouter la ville
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          {(
            [
              { id: 'reference', label: 'Depuis le référentiel officiel' },
              { id: 'manual', label: 'Saisie libre' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id)}
              aria-pressed={mode === tab.id}
              className={`h-10 rounded-pill px-4 text-sm font-semibold transition-colors ${
                mode === tab.id
                  ? 'bg-gradient-brand text-white shadow-glow-brand'
                  : 'bg-slate-100 text-ink-soft hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mode === 'reference' ? (
          <>
            {reference.isLoading ? (
              <p className="hint">Chargement du référentiel…</p>
            ) : missing.length === 0 ? (
              <Alert tone="success">
                Les 46 localités du découpage officiel sont déjà enregistrées. Utilisez la saisie
                libre pour une localité hors référentiel.
              </Alert>
            ) : (
              <>
                <Select
                  label="Région administrative"
                  value={region}
                  onChange={(event) => {
                    setRegion(event.target.value);
                    setSelected('');
                  }}
                  placeholder="Toutes les régions"
                  options={regions.map((name) => ({ value: name, label: name }))}
                />

                <Select
                  label="Localité"
                  value={selected}
                  onChange={(event) => setSelected(event.target.value)}
                  placeholder={`${choices.length} localité(s) à ajouter`}
                  options={choices.map((locality) => ({
                    value: locality.code,
                    label: `${locality.name} — ${locality.region} (${locality.code})`,
                  }))}
                  hint="Seules les localités absentes de la base sont proposées."
                  required
                />

                {chosen && (
                  <Alert tone="info">
                    <strong>{chosen.name}</strong> sera enregistrée comme{' '}
                    {TYPES.find((type) => type.value === chosen.type)?.label.toLowerCase()} de la
                    région {chosen.region}, code <strong>{chosen.code}</strong>.
                  </Alert>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <Input
              label="Nom de la localité"
              value={form.name}
              onChange={(event) => {
                const name = event.target.value;
                setForm((current) => ({
                  ...current,
                  name,
                  // Le code suit le nom tant qu'il n'a pas été retouché.
                  code:
                    current.code === '' || current.code === suggestCode(current.name)
                      ? suggestCode(name)
                      : current.code,
                }));
                setFieldErrors({});
              }}
              error={fieldErrors.name}
              required
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Code"
                value={form.code}
                onChange={(event) =>
                  setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
                }
                error={fieldErrors.code}
                hint="Court et unique, en majuscules."
                required
              />

              <Select
                label="Type"
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({ ...current, type: event.target.value as LocationType }))
                }
                options={TYPES}
              />
            </div>

            <Input
              label="Région administrative"
              value={form.region}
              onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))}
              error={fieldErrors.region}
              placeholder="Kindia, Boké…"
            />

            <Textarea
              label="Description"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              rows={2}
            />
          </>
        )}
      </div>
    </Modal>
  );
}

export type { GuineaReference };
