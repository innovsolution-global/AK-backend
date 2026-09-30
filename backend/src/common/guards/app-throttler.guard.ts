import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Limiteur de débit (§29) compté **par utilisateur connecté**.
 *
 * Compter par adresse IP pénalisait un bureau entier derrière la même sortie
 * internet : quelques collègues ouvrant le tableau de bord suffisaient à
 * épuiser le quota commun. Ce guard s'exécute après `JwtAuthGuard` : sur une
 * route protégée, `request.user` est donc déjà vérifié (signature JWT) et sert
 * de clé ; sur une route publique — connexion, lien d'invitation, lien Google
 * Earth — il n'y a pas d'utilisateur et l'IP reste la clé, ce qui préserve la
 * protection contre le brute-force.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    request: Request & { user?: AuthenticatedUser },
  ): Promise<string> {
    if (request.user?.id) return `user:${request.user.id}`;
    return `ip:${request.ips?.length ? request.ips[0] : request.ip}`;
  }
}
