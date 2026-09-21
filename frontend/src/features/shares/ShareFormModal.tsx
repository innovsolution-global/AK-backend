import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { propertiesApi, sharesApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { humanizeEnum } from '@/utils/format';

interface ShareFormModalProps {
  propertyId: string;
  propertyReference: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const DEFAULT_DAYS = 30;

function defaultExpiry(): string {
  const date = new Date();
  date.setDate(date.getDate() + DEFAULT_DAYS);
  return date.toISOString().slice(0, 10);
}

export function ShareFormModal({
  propertyId,
  propertyReference,
  open,
  onClose,
  onCreated,
}: ShareFormModalProps) {
  const toast = useToast();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [expiresAt, setExpiresAt] = useState(defaultExpiry());
  const [allowCoordinates, setAllowCoordinates] = useState(true);
  const [allowGoogleEarth, setAllowGoogleEarth] = useState(true);
  const [allowDocuments, setAllowDocuments] = useState(true);
  const [documentIds, setDocumentIds] = useState<string[]>([]);

  const { data: documents } = useQuery({
    queryKey: queryKeys.properties.documents(propertyId),
    queryFn: () => propertiesApi.documents(propertyId, { limit: 100 }),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      sharesApi.create(propertyId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        message: message.trim() || undefined,
        // L'API attend un instant ISO ; la saisie est une date, on vise la fin
        // de journée pour que l'accès couvre le jour indiqué en entier.
        expiresAt: new Date(`${expiresAt}T23:59:59`).toISOString(),
        allowCoordinates,
        allowGoogleEarth,
        allowDocuments,
        documentIds: allowDocuments ? documentIds : [],
      }),
    onSuccess: (result) => {
      toast.success(
        result.invitationSent
          ? `Invitation envoyée à ${email}.`
          : `Partage créé, mais l'email n'a pas pu être envoyé. Utilisez « Renvoyer ».`,
      );
      reset();
      onCreated();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reset = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setMessage('');
    setExpiresAt(defaultExpiry());
    setDocumentIds([]);
  };

  const canSubmit =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    /\S+@\S+\.\S+/.test(email) &&
    expiresAt.length > 0;

  const availableDocuments = documents?.data ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Partager ${propertyReference}`}
      description="Le bénéficiaire recevra un lien d'activation et choisira son propre mot de passe."
      size="lg"
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
            Créer le partage
          </Button>
        </>
      }
    >
      <div className="space-y-5">
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
          <Input
            label="Adresse email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Input
            label="Téléphone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Facultatif"
          />
        </div>

        <Input
          label="Date d'expiration"
          type="date"
          value={expiresAt}
          min={new Date().toISOString().slice(0, 10)}
          onChange={(event) => setExpiresAt(event.target.value)}
          hint="L'accès sera automatiquement désactivé à cette date."
          required
        />

        <Textarea
          label="Message joint à l'invitation"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Facultatif — visible dans l'email"
          rows={3}
        />

        <fieldset className="rounded-2xl border border-slate-100 dark:border-white/5 p-4">
          <legend className="px-1.5 text-sm font-medium text-ink-soft dark:text-slate-300">
            Ce que le bénéficiaire pourra voir
          </legend>

          <div className="space-y-2.5">
            <Toggle
              checked={allowCoordinates}
              onChange={setAllowCoordinates}
              label="Coordonnées et carte"
            />
            <Toggle
              checked={allowGoogleEarth}
              onChange={setAllowGoogleEarth}
              label="Fichiers Google Earth"
            />
            <Toggle
              checked={allowDocuments}
              onChange={setAllowDocuments}
              label="Documents sélectionnés"
            />
          </div>

          {allowDocuments && (
            <div className="mt-4 border-t border-slate-100 dark:border-white/5 pt-3">
              {availableDocuments.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Ce bien n'a aucun document à partager.
                </p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-ink-muted">
                    Cochez les documents accessibles. Sans sélection, aucun
                    document ne sera visible.
                  </p>
                  <div className="max-h-40 space-y-1.5 overflow-y-auto">
                    {availableDocuments.map((doc) => (
                      <label
                        key={doc.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded px-1 py-1 hover:bg-slate-50 dark:hover:bg-white/5"
                      >
                        <input
                          type="checkbox"
                          checked={documentIds.includes(doc.id)}
                          onChange={(event) =>
                            setDocumentIds((current) =>
                              event.target.checked
                                ? [...current, doc.id]
                                : current.filter((value) => value !== doc.id),
                            )
                          }
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 dark:text-brand-400 focus:ring-brand-600"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-ink-soft dark:text-slate-300">
                          {doc.name}
                          <span className="ml-1.5 text-xs text-ink-muted">
                            {humanizeEnum(doc.type)}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </fieldset>

        <Alert tone="warning">
          Aucun mot de passe ne transite par vous : le bénéficiaire définit le
          sien depuis le lien d'activation, valable une seule fois.
        </Alert>
      </div>
    </Modal>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-brand-600 dark:text-brand-400 focus:ring-brand-600"
      />
      <span className="text-sm text-ink-soft dark:text-slate-300">{label}</span>
    </label>
  );
}
