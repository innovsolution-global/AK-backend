import { ROLES } from '../constants/rbac.constants';
import type { AuthenticatedUser } from '../types/authenticated-user';
import { ScopeService } from './scope.service';

function userWith(roles: string[]): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'test@ak-immo.local',
    firstName: 'Test',
    lastName: 'Utilisateur',
    mustChangePassword: false,
    roles: roles as AuthenticatedUser['roles'],
    permissions: [],
  };
}

describe('ScopeService', () => {
  const scope = new ScopeService();

  describe('propertyFilter', () => {
    it("n'applique aucune restriction de périmètre à un administrateur", () => {
      const filter = scope.propertyFilter(userWith([ROLES.ADMIN]));

      expect(filter).toEqual({ deletedAt: null });
    });

    it('limite un gestionnaire aux biens qui lui sont attribués', () => {
      const filter = scope.propertyFilter(userWith([ROLES.GESTIONNAIRE]));

      expect(filter).toEqual({
        deletedAt: null,
        managers: { some: { userId: 'user-1' } },
      });
    });

    it('laisse un consultant voir tout le patrimoine en lecture', () => {
      const filter = scope.propertyFilter(userWith([ROLES.CONSULTANT]));

      expect(filter).toEqual({ deletedAt: null });
    });

    it("ne restreint pas un gestionnaire qui est aussi administrateur", () => {
      const filter = scope.propertyFilter(
        userWith([ROLES.GESTIONNAIRE, ROLES.ADMIN]),
      );

      expect(filter).toEqual({ deletedAt: null });
    });

    it('limite un utilisateur partagé aux partages actifs et non expirés', () => {
      const filter = scope.propertyFilter(userWith([ROLES.UTILISATEUR_PARTAGE]));

      expect(filter.deletedAt).toBeNull();
      expect(filter.shares?.some).toMatchObject({
        userId: 'user-1',
        status: 'ACTIVE',
      });
      expect(filter.shares?.some?.expiresAt).toEqual({ gt: expect.any(Date) });
    });
  });

  describe('projectFilter', () => {
    it("interdit tout projet à un utilisateur partagé", () => {
      const filter = scope.projectFilter(userWith([ROLES.UTILISATEUR_PARTAGE]));

      // Une liste d'identifiants vide ne peut jamais correspondre : le §22
      // exclut les projets de la vue du bénéficiaire.
      expect(filter).toEqual({ deletedAt: null, id: { in: [] } });
    });

    it('donne au gestionnaire ses projets et ceux de ses domaines', () => {
      const filter = scope.projectFilter(userWith([ROLES.GESTIONNAIRE]));

      expect(filter.OR).toEqual([
        { managerId: 'user-1' },
        { property: { managers: { some: { userId: 'user-1' } } } },
      ]);
    });
  });

  describe('merge', () => {
    it('combine périmètre et filtres sans écrasement', () => {
      const merged = scope.merge(
        { deletedAt: null, managers: { some: { userId: 'user-1' } } },
        { status: 'AMENAGE' } as never,
      );

      // Le filtre utilisateur ne doit jamais remplacer la contrainte de
      // périmètre portant sur la même clé.
      expect(merged).toEqual({
        AND: [
          { deletedAt: null, managers: { some: { userId: 'user-1' } } },
          { status: 'AMENAGE' },
        ],
      });
    });
  });
});
