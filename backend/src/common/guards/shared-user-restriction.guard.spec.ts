import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES } from '../constants/rbac.constants';
import type { AuthenticatedUser } from '../types/authenticated-user';
import { SharedUserRestrictionGuard } from './shared-user-restriction.guard';

function userWith(roles: string[]): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'test@ak-immo.local',
    firstName: 'Test',
    lastName: 'Utilisateur',
    mustChangePassword: false,
    roles: roles as AuthenticatedUser['roles'],
    // Le bénéficiaire porte réellement ces permissions : c'est précisément
    // pourquoi le confinement par route est nécessaire.
    permissions: ['property.read', 'document.read'] as AuthenticatedUser['permissions'],
  };
}

function contextFor(
  path: string,
  user: AuthenticatedUser | undefined,
  isPublic = false,
): { context: ExecutionContext; reflector: Reflector } {
  const reflector = {
    getAllAndOverride: () => isPublic,
  } as unknown as Reflector;

  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ user, route: { path }, path, method: 'GET' }),
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;

  return { context, reflector };
}

describe('SharedUserRestrictionGuard', () => {
  describe('utilisateur partagé', () => {
    const beneficiary = userWith([ROLES.UTILISATEUR_PARTAGE]);

    it.each([
      '/api/shared/properties',
      '/api/shared/properties/:id',
      '/api/shared/documents/:id/download',
      '/api/auth/me',
      '/api/auth/logout',
      '/api/health',
    ])('autorise %s', (path) => {
      const { context, reflector } = contextFor(path, beneficiary);
      const guard = new SharedUserRestrictionGuard(reflector);

      expect(guard.canActivate(context)).toBe(true);
    });

    it.each([
      '/api/properties',
      '/api/properties/:id',
      '/api/properties/:id/documents',
      '/api/projects',
      '/api/maps/properties',
      '/api/users',
      '/api/locations',
      '/api/companies',
      '/api/shares',
      '/api/audit-logs',
      '/api/dashboard/overview',
    ])('refuse %s', (path) => {
      const { context, reflector } = contextFor(path, beneficiary);
      const guard = new SharedUserRestrictionGuard(reflector);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it("ne confond pas un préfixe : /api/sharesXYZ n'est pas /api/shared", () => {
      const { context, reflector } = contextFor('/api/shares-export', beneficiary);
      const guard = new SharedUserRestrictionGuard(reflector);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('autres rôles', () => {
    it.each([ROLES.ADMIN, ROLES.GESTIONNAIRE, ROLES.CONSULTANT])(
      '%s accède aux routes internes',
      (role) => {
        const { context, reflector } = contextFor('/api/properties', userWith([role]));
        const guard = new SharedUserRestrictionGuard(reflector);

        expect(guard.canActivate(context)).toBe(true);
      },
    );
  });

  it('laisse passer les routes publiques', () => {
    const { context, reflector } = contextFor('/api/auth/login', undefined, true);
    const guard = new SharedUserRestrictionGuard(reflector);

    expect(guard.canActivate(context)).toBe(true);
  });

  it("n'interfère pas quand aucun utilisateur n'est attaché", () => {
    const { context, reflector } = contextFor('/api/properties', undefined);
    const guard = new SharedUserRestrictionGuard(reflector);

    expect(guard.canActivate(context)).toBe(true);
  });
});
