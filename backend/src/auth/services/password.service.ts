import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Hachage des mots de passe (§8) — Argon2id exclusivement.
 *
 * Paramètres alignés sur les recommandations OWASP : 19 MiB de mémoire,
 * 2 itérations, parallélisme 1. Aucun mot de passe n'est stocké ni journalisé
 * en clair.
 */
@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  private readonly options: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  };

  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, this.options);
  }

  /**
   * Vérifie un mot de passe.
   *
   * Un hash corrompu ou d'un format inconnu ne doit pas faire remonter
   * d'exception au client : il est journalisé et traité comme un échec.
   */
  async verify(hash: string, plainPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plainPassword);
    } catch (error) {
      this.logger.warn(
        `Vérification de mot de passe impossible : ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Consomme le même temps de calcul qu'une vérification réelle.
   *
   * Appelé lorsque l'email n'existe pas, afin que la durée de réponse ne
   * permette pas d'énumérer les comptes existants.
   */
  async fakeVerify(): Promise<void> {
    await argon2.hash('mot-de-passe-factice-pour-temps-constant', this.options);
  }

  /** `true` si le hash a été produit avec des paramètres désormais obsolètes. */
  needsRehash(hash: string): boolean {
    try {
      return argon2.needsRehash(hash, this.options);
    } catch {
      return true;
    }
  }
}
