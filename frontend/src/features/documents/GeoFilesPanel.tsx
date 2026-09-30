import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { googleEarthApi, propertiesApi } from '@/api/endpoints';
import { queryKeys } from '@/app/query-client';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { formatArea, formatDateTime, formatFileSize } from '@/utils/format';
import { saveBlob } from '@/utils/download';
import { EarthLinkCard } from '@/features/map/EarthLinkCard';
import { ParcelMap } from '@/features/map/ParcelMap';
import { centroid, parcelRing, primaryPoint, toParcelPoints } from '@/features/map/parcel';
import { Dropzone } from './Dropzone';

const EXTRACTION_LABELS: Record<string, { label: string; tone: string }> = {
  SUCCESS: { label: 'Géométrie extraite', tone: 'text-success-600 dark:text-success-400' },
  PARTIAL: { label: 'Extraction partielle', tone: 'text-amber-600 dark:text-amber-400' },
  FAILED: { label: 'Extraction impossible', tone: 'text-red-700 dark:text-red-400' },
  PENDING: { label: 'En attente', tone: 'text-ink-muted' },
};

/**
 * Onglet Google Earth d'un terrain (§12).
 *
 * Trois gestes : importer le KML du géomètre, le voir superposé à l'emprise
 * saisie, et l'adopter comme emprise officielle du terrain. À droite, le
 * fichier KML généré par AK IMMO — celui que reçoivent les bénéficiaires.
 */
export function GeoFilesPanel({ propertyId }: { propertyId: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [toApply, setToApply] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.properties.geoFiles(propertyId),
    queryFn: () => propertiesApi.geoFiles(propertyId),
  });

  // Déjà en cache depuis la fiche : aucune requête supplémentaire en pratique.
  const property = useQuery({
    queryKey: queryKeys.properties.detail(propertyId),
    queryFn: () => propertiesApi.detail(propertyId),
  });

  const preview = useQuery({
    queryKey: [...queryKeys.properties.geoFiles(propertyId), 'geometry', previewId],
    queryFn: () => googleEarthApi.geometry(propertyId, previewId!),
    enabled: previewId !== null,
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
      if (result.extractionStatus === 'FAILED') {
        toast.error('Fichier importé, mais sa géométrie n’a pas pu être lue.');
      } else if (result.autoApplied) {
        toast.success(
          `Emprise dessinée : ${result.appliedVertexCount} bornes${
            result.measuredAreaSqm ? `, ${formatArea(result.measuredAreaSqm)} mesurés` : ''
          }.`,
        );
      } else {
        toast.success(
          'Fichier importé. Le terrain a déjà une emprise : utilisez « Appliquer » pour la remplacer.',
        );
      }
      setFile(null);
      setUploadOpen(false);
      if (result.extractionStatus !== 'FAILED' && !result.autoApplied) setPreviewId(result.id);
      invalidate();
      if (result.autoApplied) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.properties.detail(propertyId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.map.all });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (fileId: string) => googleEarthApi.remove(propertyId, fileId),
    onSuccess: (_, fileId) => {
      toast.success('Fichier supprimé.');
      setToDelete(null);
      if (previewId === fileId) setPreviewId(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const apply = useMutation({
    mutationFn: (fileId: string) => googleEarthApi.applyCoordinates(propertyId, fileId),
    onSuccess: (result) => {
      toast.success(
        result.measuredAreaSqm
          ? `Emprise reprise : ${result.vertexCount} bornes, ${formatArea(result.measuredAreaSqm)} mesurés.`
          : `${result.vertexCount} point(s) repris comme coordonnées.`,
      );
      setToApply(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.properties.detail(propertyId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.map.all });
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

  const exportKml = async () => {
    const { blob, fileName } = await googleEarthApi.exportKml(propertyId);
    saveBlob(blob, fileName);
  };

  const coordinates = property.data?.coordinates ?? [];
  const points = useMemo(() => toParcelPoints(coordinates), [coordinates]);
  const ring = useMemo(() => parcelRing(points), [points]);
  const primary = primaryPoint(points);
  const center = ring.length >= 3 ? centroid(ring) : primary;
  const areaSqm = Number(property.data?.areaSqm ?? 0);

  if (isLoading) return <Skeleton className="h-64" />;

  const files = data ?? [];
  const previewFile = files.find((geo) => geo.id === previewId) ?? null;
  const previewGeometry =
    preview.data?.extractedGeometry && previewId ? [preview.data.extractedGeometry] : [];

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-white/5">
            <div>
              <h2 className="text-sm font-semibold text-ink dark:text-white">
                Fichiers importés ({files.length})
              </h2>
              <p className="text-xs text-ink-muted">
                Relevés du géomètre au format .KML ou .KMZ, 25 Mo maximum.
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
              description="Importez le .KML ou .KMZ du géomètre : son polygone pourra devenir l'emprise officielle du terrain."
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
                const readable =
                  geo.extractionStatus === 'SUCCESS' || geo.extractionStatus === 'PARTIAL';
                const isPreview = geo.id === previewId;

                return (
                  <li
                    key={geo.id}
                    className={`flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors ${
                      isPreview ? 'bg-cyan-50/60 dark:bg-cyan-500/5' : ''
                    }`}
                  >
                    <Icon
                      name="globe"
                      className={`h-5 w-5 shrink-0 ${isPreview ? 'text-cyan-600' : 'text-ink-muted'}`}
                    />

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
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {geo.extractionError}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {readable && (
                        <Button
                          variant={isPreview ? 'primary' : 'secondary'}
                          size="sm"
                          onClick={() => setPreviewId(isPreview ? null : geo.id)}
                          icon={<Icon name={isPreview ? 'eyeOff' : 'eye'} className="h-4 w-4" />}
                        >
                          {isPreview ? 'Masquer' : 'Voir'}
                        </Button>
                      )}
                      {readable && can('property.update') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setToApply(geo.id)}
                          icon={<Icon name="layers" className="h-4 w-4" />}
                          title="Reprendre le polygone du fichier comme coordonnées du terrain"
                        >
                          Appliquer
                        </Button>
                      )}
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
        </div>

        {property.data && (primary || previewGeometry.length > 0) && (
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 dark:border-white/5">
              <div>
                <h3 className="text-sm font-semibold text-ink dark:text-white">Aperçu</h3>
                <p className="text-xs text-ink-muted">
                  Emprise du terrain en cyan
                  {previewFile && (
                    <>
                      {' · '}
                      <span className="text-amber-600 dark:text-amber-400">
                        {previewFile.fileName}
                      </span>{' '}
                      en pointillés
                    </>
                  )}
                </p>
              </div>
              {preview.isLoading && <span className="hint">Chargement de la géométrie…</span>}
            </div>
            <ParcelMap
              coordinates={coordinates}
              geometries={previewGeometry}
              status={property.data.status}
              label={property.data.reference}
              areaSqm={areaSqm}
              height={360}
              compact
            />
          </div>
        )}
      </div>

      <div className="space-y-4 lg:col-span-2">
        {property.data && (
          <EarthLinkCard
            reference={property.data.reference}
            center={center}
            areaSqm={areaSqm}
            vertexCount={ring.length}
            onDownload={exportKml}
            legacyUrl={property.data.googleEarthUrl}
          />
        )}

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-ink dark:text-white">Comment ça marche</h3>
          <ol className="mt-3 space-y-3 text-sm text-ink-soft dark:text-slate-300">
            <li className="flex gap-3">
              <span className="icon-disc h-7 w-7 shrink-0 text-xs font-bold">1</span>
              <span>
                <strong className="text-ink dark:text-white">Importez</strong> le fichier du
                géomètre (.kml / .kmz). Si le terrain n’a pas encore d’emprise, son polygone
                est dessiné <strong className="text-ink dark:text-white">immédiatement</strong> :
                sommets → bornes, centre → repère.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="icon-disc h-7 w-7 shrink-0 text-xs font-bold">2</span>
              <span>
                <strong className="text-ink dark:text-white">Appliquez</strong> pour remplacer
                une emprise existante par celle d’un nouveau fichier ; « Voir » la superpose
                d’abord en pointillés.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="icon-disc h-7 w-7 shrink-0 text-xs font-bold">3</span>
              <span>
                <strong className="text-ink dark:text-white">Partagez</strong> : le bénéficiaire
                reçoit un lien .kml qui ouvre l’emprise dans Google Earth, révocable à tout
                moment.
              </span>
            </li>
          </ol>
        </div>
      </div>

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
            <Button loading={upload.isPending} disabled={!file} onClick={() => upload.mutate()}>
              Importer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="info">
            Seuls les formats <strong>.KML</strong> et <strong>.KMZ</strong> sont acceptés. Les
            points, lignes et polygones sont extraits automatiquement.
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
        open={toApply !== null}
        onClose={() => setToApply(null)}
        onConfirm={() => toApply && apply.mutate(toApply)}
        loading={apply.isPending}
        title="Reprendre l’emprise du fichier ?"
        description={
          coordinates.length > 0
            ? `Les ${coordinates.length} coordonnée(s) actuelle(s) du terrain seront remplacées par les sommets du premier polygone du fichier. Le fichier importé reste conservé.`
            : 'Les sommets du premier polygone du fichier deviendront les coordonnées du terrain.'
        }
        confirmLabel="Appliquer comme emprise"
      />

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        loading={remove.isPending}
        destructive
        title="Supprimer ce fichier ?"
        description="Le fichier ne sera plus proposé au téléchargement. Les coordonnées déjà reprises sur le terrain sont conservées."
        confirmLabel="Supprimer"
      />
    </div>
  );
}
