import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators';
import { ROLES } from '../constants/rbac.constants';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Confine le rôle `UTILISATEUR_PARTAGE` à son espace dédié (§22).
 *
 * Le `ScopeService` restreint les **lignes** visibles, pas les **champs** :
 * un bénéficiaire porteur de `property.read` pouvait appeler `/api/properties`
 * et recevoir la fiche complète de son bien — notes internes, sessionnaire,
 * gestionnaires — alors que le §22 limite sa vue à une liste blanche.
 *
 * Ce guard ferme la porte en amont : hors `/shared` et `/auth`, un bénéficiaire
 * n'atteint aucun contrôleur. Les projections restreintes de
 * `SharedAccessService` restent la seconde ligne de défense.
 */
@Injectable()
export class SharedUserRestrictionGuard implements CanActivate {
  private readonly logger = new Logger(SharedUserRestrictionGuard.name);

  /** Segments accessibles, relatifs au préfixe d'API. */
  private static readonly ALLOWED_SEGMENTS = ['shared', 'auth', 'health'];

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user?.roles.includes(ROLES.UTILISATEUR_PARTAGE)) return true;

    // `route.path` porte le motif déclaré ; on retombe sur l'URL réelle si la
    // route n'a pas encore été résolue.
    const path: string = request.route?.path ?? request.path ?? '';
    const segments = path.split('/').filter(Boolean);
    const first = segments[0] === 'api' ? segments[1] : segments[0];

    if (first && SharedUserRestrictionGuard.ALLOWED_SEGMENTS.includes(first)) {
      return true;
    }

    this.logger.warn(
      `Bénéficiaire ${user.id} bloqué hors de son espace : ${request.method} ${path}`,
    );

    throw new ForbiddenException({
      message: 'Votre accès est limité aux biens qui vous ont été partagés.',
      error: 'FORBIDDEN',
    });
  }
}
