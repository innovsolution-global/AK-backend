import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { googleEarthApi, propertiesApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { formatDateTime, formatFileSize } from '@/utils/format';
import { Dropzone } from './Dropzone';

const EXTRACTION_LABELS: Record<string, { label: string; tone: string }> = {
  SUCCESS: { label: 'Géométrie extraite', tone: 'text-success-600 dark:text-success-400' },
  PARTIAL: { label: 'Extraction partielle', tone: 'text-amber-600 dark:text-amber-400' },
  FAILED: { label: 'Extraction impossible', tone: 'text-red-700 dark:text-red-400' },
  PENDING: { label: 'En attente', tone: 'text-ink-muted' },
};

export function GeoFilesPanel({ propertyId }: { propertyId: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.properties.geoFiles(propertyId),
    queryFn: () => propertiesApi.geoFiles(propertyId),
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: queryKeys.properties.geoFiles(propertyId),
    });

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Sélectionnez un fichier.');
      return googleEarthApi.upload(propertyId, file);
    },
    onSuccess: (result) => {
      toast.success(
        result.extractionStatus === 'FAILED'
          ? 'Fichier importé, mais sa géométrie n’a pas pu être lue.'
          : 'Fichier importé et géométrie extraite.',
      );
      setFile(null);
      setUploadOpen(false);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (fileId: string) => googleEarthApi.remove(propertyId, fileId),
    onSuccess: () => {
      toast.success('Fichier supprimé.');
      setToDelete(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const download = async (fileId: string) => {
    try {
      const { url } = await googleEarthApi.download(propertyId, fileId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  if (isLoading) return <Skeleton className="h-64" />;

  const files = data ?? [];

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-ink dark:text-white">
            Fichiers Google Earth ({files.length})
          </h2>
          <p className="text-xs text-ink-muted">
            Emprises au format .KML ou .KMZ, 25 Mo maximum.
          </p>
        </div>
        {can('document.upload') && (
          <Button
            size="sm"
            icon={<Icon name="upload" className="h-4 w-4" />}
            onClick={() => setUploadOpen(true)}
          >
            Importer
          </Button>
        )}
      </div>

      {files.length === 0 ? (
        <EmptyState
          title="Aucun fichier Google Earth"
          description="Importez un .KML ou .KMZ pour visualiser l'emprise du domaine."
          icon={<Icon name="globe" className="h-10 w-10" />}
          action={
            can('document.upload') && (
              <Button onClick={() => setUploadOpen(true)}>Importer un fichier</Button>
            )
          }
        />
      ) : (
        <ul className="divide-y divide-slate-50 dark:divide-white/5">
          {files.map((geo) => {
            const extraction =
              EXTRACTION_LABELS[geo.extractionStatus] ?? EXTRACTION_LABELS.PENDING;

            return (
              <li key={geo.id} className="flex items-center gap-4 px-5 py-3.5">
                <Icon name="globe" className="h-5 w-5 shrink-0 text-ink-muted" />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink dark:text-white">
                    {geo.fileName}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {geo.format} · {formatFileSize(geo.size)} ·{' '}
                    <span className={extraction?.tone}>{extraction?.label}</span>
                    {geo.featureCount !== null && ` (${geo.featureCount} objets)`}
                    {' · '}
                    {formatDateTime(geo.createdAt)}
                  </p>
                  {geo.extractionError && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">{geo.extractionError}</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void download(geo.id)}
                    icon={<Icon name="download" className="h-4 w-4" />}
                    aria-label={`Télécharger ${geo.fileName}`}
                  />
                  {can('document.delete') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setToDelete(geo.id)}
                      icon={<Icon name="trash" className="h-4 w-4" />}
                      aria-label="Supprimer"
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Importer un fichier Google Earth"
        description="Le fichier est conservé même si sa géométrie ne peut pas être lue."
        footer={
          <>
            <Button variant="secondary" onClick={() => setUploadOpen(false)}>
              Annuler
            </Button>
            <Button
              loading={upload.isPending}
              disabled={!file}
              onClick={() => upload.mutate()}
            >
              Importer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="info">
            Seuls les formats <strong>.KML</strong> et <strong>.KMZ</strong> sont
            acceptés. Les points, lignes et polygones sont extraits automatiquement.
          </Alert>
          <Dropzone
            file={file}
            onFileChange={setFile}
            accept=".kml,.kmz"
            label="Glissez votre fichier .KML ou .KMZ"
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        loading={remove.isPending}
        destructive
        title="Supprimer ce fichier ?"
        description="L'emprise ne sera plus affichée sur la carte."
        confirmLabel="Supprimer"
      />
    </div>
  );
}
