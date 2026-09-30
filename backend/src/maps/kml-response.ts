import type { Response } from 'express';

export const KML_MIME_TYPE = 'application/vnd.google-earth.kml+xml';

/**
 * Envoie un document KML brut, hors enveloppe JSON.
 *
 * Le type MIME officiel et l'extension `.kml` dans le nom de fichier sont ce
 * qui permet au système — ou au navigateur — de proposer Google Earth à
 * l'ouverture.
 */
export function sendKml(response: Response, fileName: string, kml: string): void {
  const safeName = fileName.replace(/[^\w.-]/g, '_');

  response
    .status(200)
    .setHeader('Content-Type', `${KML_MIME_TYPE}; charset=utf-8`)
    .setHeader('Content-Disposition', `attachment; filename="${safeName}"`)
    .setHeader('Cache-Control', 'no-store')
    .setHeader('X-Content-Type-Options', 'nosniff')
    .send(kml);
}
