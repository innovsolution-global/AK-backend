import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Génère un token cryptographiquement aléatoire (§20).
 *
 * 32 octets → 256 bits d'entropie, encodés en base64url : utilisable tel quel
 * dans une URL d'invitation.
 */
export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Empreinte SHA-256 stockée en base à la place du token en clair.
 *
 * Argon2 est réservé aux mots de passe : inutile ici puisqu'un token de 256 bits
 * n'est pas attaquable par dictionnaire, et un hachage rapide permet une
 * recherche par index.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Comparaison à temps constant, pour éviter les attaques temporelles. */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Empreinte du contenu d'un fichier, stockée avec ses métadonnées. */
export function checksumBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Mot de passe temporaire aléatoire (§21) : utilisé uniquement si le lien
 * d'activation ne peut pas être employé. Toujours associé à
 * `mustChangePassword = true`.
 */
export function generateTemporaryPassword(length = 16): string {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  const bytes = randomBytes(length);

  let password = '';
  for (let i = 0; i < length; i += 1) {
    password += alphabet[bytes[i] % alphabet.length];
  }
  return password;
}
