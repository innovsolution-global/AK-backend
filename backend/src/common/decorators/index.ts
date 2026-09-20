import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { PermissionCode, RoleCode } from '../constants/rbac.constants';
import type { AuthenticatedUser } from '../types/authenticated-user';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'requiredRoles';
export const PERMISSIONS_KEY = 'requiredPermissions';
export const AUDIT_KEY = 'auditMetadata';

/** Route accessible sans authentification (login, activation d'un partage…). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Exige au moins un des rôles listés. Filtre grossier, complété par les permissions. */
export const Roles = (...roles: RoleCode[]) => SetMetadata(ROLES_KEY, roles);

/** Exige *toutes* les permissions listées (principe du moindre privilège). */
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export interface AuditMetadata {
  action:
    | 'LOGIN'
    | 'LOGOUT'
    | 'CREATE'
    | 'UPDATE'
    | 'DELETE'
    | 'UPLOAD'
    | 'DOWNLOAD'
    | 'SHARE'
    | 'REVOKE_SHARE'
    | 'VIEW'
    | 'PASSWORD_CHANGE';
  entity: string;
}

/** Marque une route pour journalisation dans `audit_logs` (§26). */
export const Audit = (metadata: AuditMetadata) => SetMetadata(AUDIT_KEY, metadata);

/**
 * Injecte l'utilisateur authentifié, ou l'une de ses propriétés.
 *
 * @example
 *   findAll(@CurrentUser() user: AuthenticatedUser)
 *   findMine(@CurrentUser('id') userId: string)
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
