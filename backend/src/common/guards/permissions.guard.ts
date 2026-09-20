import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../decorators';
import type { PermissionCode } from '../constants/rbac.constants';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Niveau 3 de la chaîne d'accès : permissions fines.
 *
 * Exige **toutes** les permissions déclarées (`@RequirePermissions(...)`).
 * Répond à « cette action est-elle autorisée ? » ; le périmètre
 * (« sur quelles lignes ? ») est appliqué ensuite par `ScopeService`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<PermissionCode[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    const missing = required.filter(
      (permission) => !user?.permissions.includes(permission),
    );

    if (missing.length > 0) {
      throw new ForbiddenException({
        message: "Vous n'êtes pas autorisé à effectuer cette action.",
        error: 'FORBIDDEN',
        details: missing.map((permission) => ({
          message: `Permission requise : ${permission}`,
          code: 'MISSING_PERMISSION',
        })),
      });
    }

    return true;
  }
}
