/**
 * Déclenche l'enregistrement d'un blob sous un nom de fichier.
 *
 * Un lien `<a download>` ne peut pas porter le jeton d'accès : on télécharge
 * donc via le client HTTP puis on remet le fichier au navigateur ici.
 */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Laisse le temps au navigateur de lire l'URL avant de la révoquer.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Copie dans le presse-papiers, avec repli sur `execCommand` hors HTTPS. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission refusée : on tente le repli ci-dessous.
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  } catch {
    return false;
  }
}
