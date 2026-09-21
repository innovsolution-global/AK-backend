import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { documentsApi, propertiesApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Input, Select } from '@/components/ui/Field';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { formatDateTime, formatFileSize, humanizeEnum } from '@/utils/format';
import { PROPERTY_DOCUMENT_TYPES } from '@/types/domain';
import { Dropzone } from './Dropzone';

export function DocumentsPanel({ propertyId }: { propertyId: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [versionFor, setVersionFor] = useState<string | null>(null);
  const versionInput = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.properties.documents(propertyId),
    queryFn: () => propertiesApi.documents(propertyId, { limit: 100 }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.properties.documents(propertyId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.properties.detail(propertyId),
    });
  };

  const remove = useMutation({
    mutationFn: documentsApi.remove,
    onSuccess: () => {
      toast.success('Document supprimé.');
      setToDelete(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const uploadVersion = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      documentsApi.uploadVersion(id, file),
    onSuccess: () => {
      toast.success('Nouvelle version enregistrée.');
      setVersionFor(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /**
   * Le téléchargement passe par une URL signée à durée limitée : on l'ouvre
   * dans un onglet séparé plutôt que de naviguer, pour ne pas perdre l'écran.
   */
  const download = async (id: string) => {
    try {
      const { url } = await documentsApi.download(id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  if (isLoading) return <Skeleton className="h-64" />;

  const documents = data?.data ?? [];

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-ink dark:text-white">
            Documents ({documents.length})
          </h2>
          <p className="text-xs text-ink-muted">
            Titres, plans, conventions et actes rattachés au bien.
          </p>
        </div>
        {can('document.upload') && (
          <Button
            size="sm"
            icon={<Icon name="upload" className="h-4 w-4" />}
            onClick={() => setUploadOpen(true)}
          >
            Téléverser
          </Button>
        )}
      </div>

      {documents.length === 0 ? (
        <EmptyState
          title="Aucun document"
          description="Ajoutez le titre foncier, le plan de masse ou tout autre acte."
          icon={<Icon name="document" className="h-10 w-10" />}
          action={
            can('document.upload') && (
              <Button onClick={() => setUploadOpen(true)}>Téléverser un document</Button>
            )
          }
        />
      ) : (
        <ul className="divide-y divide-slate-50 dark:divide-white/5">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-4 px-5 py-3.5">
              <Icon name="document" className="h-5 w-5 shrink-0 text-ink-muted" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink dark:text-white">
                  {doc.name}
                </p>
                <p className="truncate text-xs text-ink-muted">
                  {humanizeEnum(doc.type)} · {formatFileSize(doc.size)} · version{' '}
                  {doc.version} · {formatDateTime(doc.createdAt)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void download(doc.id)}
                  icon={<Icon name="download" className="h-4 w-4" />}
                  aria-label={`Télécharger ${doc.name}`}
                />
                {can('document.upload') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setVersionFor(doc.id)}
                    icon={<Icon name="upload" className="h-4 w-4" />}
                    aria-label="Nouvelle version"
                  />
                )}
                {can('document.delete') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setToDelete(doc.id)}
                    icon={<Icon name="trash" className="h-4 w-4" />}
                    aria-label="Supprimer"
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <UploadDocumentModal
        propertyId={propertyId}
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={invalidate}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        loading={remove.isPending}
        destructive
        title="Supprimer ce document ?"
        description="Le document ne sera plus listé. Le fichier reste conservé pour l'audit et peut être restauré par un administrateur."
        confirmLabel="Supprimer"
      />

      <Modal
        open={versionFor !== null}
        onClose={() => setVersionFor(null)}
        title="Nouvelle version"
        description="L'ancienne version est conservée : rien n'est écrasé."
        footer={
          <>
            <Button variant="secondary" onClick={() => setVersionFor(null)}>
              Annuler
            </Button>
            <Button
              loading={uploadVersion.isPending}
              onClick={() => {
                const file = versionInput.current?.files?.[0];
                if (file && versionFor) {
                  uploadVersion.mutate({ id: versionFor, file });
                }
              }}
            >
              Téléverser
            </Button>
          </>
        }
      >
        <Input ref={versionInput} type="file" label="Fichier" />
      </Modal>
    </div>
  );
}

function UploadDocumentModal({
  propertyId,
  open,
  onClose,
  onUploaded,
}: {
  propertyId: string;
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('TITRE_FONCIER');
  const [file, setFile] = useState<File | null>(null);

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Sélectionnez un fichier.');
      return documentsApi.upload(propertyId, file, name.trim(), type);
    },
    onSuccess: () => {
      toast.success('Document téléversé.');
      setName('');
      setFile(null);
      onUploaded();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Téléverser un document"
      description="PDF, image ou document bureautique. 50 Mo maximum."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            loading={upload.isPending}
            disabled={!file || name.trim().length < 2}
            onClick={() => upload.mutate()}
          >
            Téléverser
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Nom du document"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Titre foncier — parcelle nord"
          required
        />

        <Select
          label="Type"
          value={type}
          onChange={(event) => setType(event.target.value)}
          options={PROPERTY_DOCUMENT_TYPES.map((value) => ({
            value,
            label: humanizeEnum(value),
          }))}
          required
        />

        <Dropzone
          file={file}
          onFileChange={(selected) => {
            setFile(selected);
            // Le nom du fichier sert de proposition tant que rien n'a été saisi.
            if (selected && name.trim().length === 0) {
              setName(selected.name.replace(/\.[^.]+$/, ''));
            }
          }}
          accept=".pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff,.doc,.docx,.xls,.xlsx"
        />
      </div>
    </Modal>
  );
}
