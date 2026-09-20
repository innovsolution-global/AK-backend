import type { PermissionCode, RoleCode } from '../constants/rbac.constants';

/**
 * Utilisateur résolu par `JwtAuthGuard` et attaché à `request.user`.
 * Les rôles et permissions sont rechargés depuis la base à chaque requête :
 * une révocation prend effet immédiatement, sans attendre l'expiration du JWT.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: RoleCode[];
  permissions: PermissionCode[];
  mustChangePassword: boolean;
}

export function hasRole(user: AuthenticatedUser, role: RoleCode): boolean {
  return user.roles.includes(role);
}

export function hasPermission(
  user: AuthenticatedUser,
  permission: PermissionCode,
): boolean {
  return user.permissions.includes(permission);
}
