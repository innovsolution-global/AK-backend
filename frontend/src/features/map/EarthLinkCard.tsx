import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { copyText } from '@/utils/download';
import { earthWebUrl, type LatLng } from './parcel';

interface EarthLinkCardProps {
  reference: string;
  /** Centre de l'emprise (ou repère) : cadre Google Earth Web. */
  center: LatLng | null;
  areaSqm: number;
  /** Nombre de bornes de l'emprise ; 0 si le terrain n'a qu'un repère. */
  vertexCount: number;
  /**
   * Télécharge le KML via l'API authentifiée (gestionnaires). Exclusif avec
   * `publicUrl`, qui sert le même fichier sans session.
   */
  onDownload?: () => Promise<void>;
  /** Lien KML stable du partage — pour le bénéficiaire, ou à copier. */
  publicUrl?: string | null;
  /** Lien Google Earth saisi à la main sur la fiche, s'il existe. */
  legacyUrl?: string | null;
  /** Mode « à transmettre » : met en avant la copie du lien. */
  shareMode?: boolean;
  className?: string;
}

/**
 * Carte « Google Earth » d'un terrain (§12).
 *
 * C'est l'aboutissement du partage : le fichier KML — emprise, repère, bornes,
 * fiche en bulle — s'ouvre dans Google Earth Pro, l'application mobile ou
 * Google Earth Web. La carte donne le fichier, un lien de cadrage, et pour un
 * partage, le lien permanent à transmettre.
 */
export function EarthLinkCard({
  reference,
  center,
  areaSqm,
  vertexCount,
  onDownload,
  publicUrl,
  legacyUrl,
  shareMode = false,
  className = '',
}: EarthLinkCardProps) {
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  const hasGeometry = center !== null;
  const webUrl = center ? earthWebUrl(center, areaSqm) : null;

  const download = async () => {
    if (!onDownload) return;
    setDownloading(true);
    try {
      await onDownload();
    } catch (caught) {
      toast.error((caught as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  const copy = async () => {
    if (!publicUrl) return;
    const ok = await copyText(publicUrl);
    if (ok) {
      setCopied(true);
      toast.success('Lien Google Earth copié.');
      window.setTimeout(() => setCopied(false), 2_000);
    } else {
      toast.error('Copie impossible : sélectionnez le lien manuellement.');
    }
  };

  return (
    <section className={`card overflow-hidden ${className}`}>
      <div className="flex items-start gap-4 p-5">
        <div className="icon-tile shrink-0 bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-[0_10px_30px_-8px_rgb(6_182_212/0.6)]">
          <Icon name="globe" className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink dark:text-white">Google Earth</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {vertexCount >= 3
              ? `Emprise de ${vertexCount} bornes, fiche du terrain incluse.`
              : hasGeometry
                ? 'Repère du terrain. Ajoutez des bornes pour partager l’emprise complète.'
                : 'Aucune coordonnée : le fichier ne peut pas être généré.'}
          </p>
        </div>
      </div>

      <div className="space-y-3 px-5 pb-5">
        {/* Action principale : obtenir le fichier. Verte, comme toute action
            « qui produit quelque chose » dans le design de référence. */}
        {onDownload && !publicUrl && (
          <Button
            variant="success"
            className="w-full"
            loading={downloading}
            disabled={!hasGeometry}
            icon={<Icon name="cloudDownload" className="h-5 w-5" />}
            onClick={() => void download()}
          >
            Télécharger {reference}.kml
          </Button>
        )}

        {publicUrl && !shareMode && (
          <a
            href={publicUrl}
            download={`${reference}.kml`}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-pill bg-gradient-success px-5 text-sm font-semibold text-white shadow-glow-success transition-all hover:brightness-105"
          >
            <Icon name="cloudDownload" className="h-5 w-5" />
            Télécharger {reference}.kml
          </a>
        )}

        {webUrl && (
          <a
            href={webUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pill-outline inline-flex h-11 w-full items-center justify-center gap-2 px-5 text-sm font-semibold transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
          >
            <Icon name="globe" className="h-4 w-4" />
            Ouvrir Google Earth Web cadré sur le terrain
          </a>
        )}

        {publicUrl && (
          <div>
            <p className="label mb-1.5">
              {shareMode ? 'Lien à transmettre au bénéficiaire' : 'Lien permanent du fichier'}
            </p>
            <div className="flex items-stretch gap-2">
              <input
                readOnly
                value={publicUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="pill-outline h-11 min-w-0 flex-1 truncate px-4 text-xs text-ink-soft dark:text-slate-300"
                aria-label="Lien Google Earth"
              />
              <Button
                variant={copied ? 'success' : 'primary'}
                size="md"
                icon={<Icon name={copied ? 'check' : 'share'} className="h-4 w-4" />}
                onClick={() => void copy()}
              >
                {copied ? 'Copié' : 'Copier'}
              </Button>
            </div>
            <p className="hint mt-1.5">
              Valable tant que le partage est actif ; la révocation le désactive immédiatement.
            </p>
          </div>
        )}

        {legacyUrl && (
          <a
            href={legacyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            <Icon name="globe" className="h-4 w-4" />
            Lien Google Earth saisi sur la fiche
          </a>
        )}

        <button
          type="button"
          onClick={() => setShowSteps((value) => !value)}
          aria-expanded={showSteps}
          className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold text-ink-soft transition-colors hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
        >
          Comment ouvrir le fichier dans Google Earth ?
          <Icon
            name="chevronDown"
            className={`h-4 w-4 transition-transform ${showSteps ? 'rotate-180' : ''}`}
          />
        </button>

        <AnimatePresence initial={false}>
          {showSteps && (
            <motion.ol
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden space-y-2 text-sm text-ink-soft dark:text-slate-300"
            >
              <Step n={1} title="Ordinateur (Google Earth Pro)">
                Double-cliquez sur le fichier .kml téléchargé : l’emprise s’ouvre sur l’imagerie
                satellite, avec la fiche du terrain dans la bulle du repère.
              </Step>
              <Step n={2} title="Google Earth Web">
                Ouvrez le lien « Google Earth Web » ci-dessus, puis menu <em>Projets</em> →{' '}
                <em>Importer un fichier KML depuis l’ordinateur</em> et choisissez le fichier.
              </Step>
              <Step n={3} title="Téléphone (application Google Earth)">
                Ouvrez le fichier .kml reçu et choisissez <em>Google Earth</em> comme
                application.
              </Step>
            </motion.ol>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 px-1">
      <span className="icon-disc mt-0.5 h-7 w-7 shrink-0 text-xs font-bold">{n}</span>
      <div>
        <p className="font-semibold text-ink dark:text-white">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{children}</p>
      </div>
    </li>
  );
}
