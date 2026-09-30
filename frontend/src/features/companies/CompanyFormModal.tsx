import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { companiesApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { ApiError } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import type { Company } from '@/types/domain';

interface CompanyFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Entreprise à modifier ; absente en création. */
  company?: Company | null;
  /** Autorise la suppression depuis la fenêtre (`company.manage`). */
  canDelete?: boolean;
}

interface FormState {
  name: string;
  registrationNumber: string;
  taxNumber: string;
  contactPerson: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  notes: string;
}

const EMPTY: FormState = {
  name: '',
  registrationNumber: '',
  taxNumber: '',
  contactPerson: '',
  phone: '',
  email: '',
  website: '',
  address: '',
  notes: '',
};

function fromCompany(company: Company): FormState {
  return {
    name: company.name,
    registrationNumber: company.registrationNumber ?? '',
    taxNumber: company.taxNumber ?? '',
    contactPerson: company.contactPerson ?? '',
    phone: company.phone ?? '',
    email: company.email ?? '',
    website: company.website ?? '',
    address: company.address ?? '',
    notes: company.notes ?? '',
  };
}

/**
 * Création et modification d'une entreprise ou d'un gérant (§16).
 *
 * Une fenêtre plutôt qu'une page : l'entreprise est un référentiel court, que
 * l'on saisit souvent au fil de l'eau, sans quitter la liste.
 */
export function CompanyFormModal({ open, onClose, company, canDelete = false }: CompanyFormModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isEdit = Boolean(company);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Réinitialise à chaque ouverture : un brouillon abandonné ne doit pas
  // réapparaître sur l'entreprise suivante.
  useEffect(() => {
    if (!open) return;
    setForm(company ? fromCompany(company) : EMPTY);
    setFieldErrors({});
  }, [open, company]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });

  const save = useMutation({
    mutationFn: () => {
      // Champ vidé : chaîne vide en édition — le backend la convertit en
      // `null` et efface la valeur —, omis en création.
      const optional = (value: string) => {
        const trimmed = value.trim();
        if (trimmed) return trimmed;
        return isEdit ? '' : undefined;
      };

      const payload = {
        name: form.name.trim(),
        registrationNumber: optional(form.registrationNumber),
        taxNumber: optional(form.taxNumber),
        contactPerson: optional(form.contactPerson),
        phone: optional(form.phone),
        email: optional(form.email),
        website: optional(form.website),
        address: optional(form.address),
        notes: optional(form.notes),
      };

      return company ? companiesApi.update(company.id, payload) : companiesApi.create(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Entreprise mise à jour.' : `Entreprise « ${form.name.trim()} » créée.`);
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

  const remove = useMutation({
    mutationFn: () => companiesApi.remove(company!.id),
    onSuccess: () => {
      toast.success('Entreprise supprimée.');
      setConfirmDelete(false);
      invalidate();
      onClose();
    },
    onError: (caught: Error) => {
      // 409 si des projets y sont rattachés : le message du backend l'explique.
      setConfirmDelete(false);
      toast.error(caught.message);
    },
  });

  const emailInvalid = form.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const websiteInvalid = form.website.trim() !== '' && !/^https?:\/\/\S+\.\S+/.test(form.website.trim());
  const canSubmit = form.name.trim().length >= 2 && !emailInvalid && !websiteInvalid;

  const projectCount = company?._count.projects ?? 0;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={isEdit ? `Modifier ${company?.name ?? ''}` : 'Nouvelle entreprise'}
        description={
          isEdit
            ? `${projectCount} projet(s) rattaché(s).`
            : 'Entreprise de construction, bureau d’études ou gérant chargé d’un projet.'
        }
        size="lg"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div>
              {isEdit && canDelete && (
                <Button
                  variant="ghost"
                  icon={<Icon name="trash" className="h-4 w-4" />}
                  onClick={() => setConfirmDelete(true)}
                  disabled={projectCount > 0}
                  title={
                    projectCount > 0
                      ? 'Suppression impossible : des projets sont rattachés à cette entreprise.'
                      : undefined
                  }
                >
                  Supprimer
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Annuler
              </Button>
              <Button
                loading={save.isPending}
                disabled={!canSubmit}
                onClick={() => save.mutate()}
              >
                {isEdit ? 'Enregistrer' : 'Créer l’entreprise'}
              </Button>
            </div>
          </div>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) save.mutate();
          }}
        >
          <Input
            label="Raison sociale"
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            error={fieldErrors.name}
            placeholder="Entreprise Générale de Construction"
            required
            autoFocus
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="N° RCCM"
              value={form.registrationNumber}
              onChange={(event) => set('registrationNumber', event.target.value)}
              error={fieldErrors.registrationNumber}
              placeholder="GN.TCC.2024.B.12345"
            />
            <Input
              label="N° d’identification fiscale"
              value={form.taxNumber}
              onChange={(event) => set('taxNumber', event.target.value)}
              error={fieldErrors.taxNumber}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Gérant / personne de contact"
              value={form.contactPerson}
              onChange={(event) => set('contactPerson', event.target.value)}
              error={fieldErrors.contactPerson}
            />
            <Input
              label="Téléphone"
              type="tel"
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
              error={fieldErrors.phone}
              placeholder="+224 6XX XX XX XX"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(event) => set('email', event.target.value)}
              error={fieldErrors.email ?? (emailInvalid ? 'Adresse email invalide.' : undefined)}
              placeholder="contact@entreprise.gn"
            />
            <Input
              label="Site web"
              type="url"
              value={form.website}
              onChange={(event) => set('website', event.target.value)}
              error={
                fieldErrors.website ??
                (websiteInvalid ? 'URL complète attendue (https://…).' : undefined)
              }
              placeholder="https://"
            />
          </div>

          <Textarea
            label="Adresse"
            value={form.address}
            onChange={(event) => set('address', event.target.value)}
            error={fieldErrors.address}
            rows={2}
          />

          <Textarea
            label="Notes internes"
            value={form.notes}
            onChange={(event) => set('notes', event.target.value)}
            error={fieldErrors.notes}
            hint="Références, qualité des prestations, conditions négociées…"
            rows={3}
          />

          {/* Entrée au clavier depuis n'importe quel champ. */}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        destructive
        title="Supprimer cette entreprise ?"
        description={`${company?.name ?? ''} sera retirée de la liste. L’opération est tracée dans le journal d’audit.`}
        confirmLabel="Supprimer"
      />
    </>
  );
}
