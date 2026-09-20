import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ROLES } from '../constants/rbac.constants';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Niveau 4 de la chaîne d'accès : le **périmètre**.
 *
 * Les guards répondent à « cette action est-elle autorisée ? ».
 * Ce service répond à « sur quelles lignes ? », et sa réponse est fusionnée
 * dans le `where` de **toutes** les lectures. Un endpoint qui oublierait de
 * l'appeler exposerait le patrimoine entier : c'est pourquoi les repositories
 * ne construisent jamais leur `where` sans passer par ici.
 *
 * Règle de fuite d'information : hors périmètre, on répond `404` et non `403`,
 * pour ne pas révéler l'existence de la ressource.
 */
@Injectable()
export class ScopeService {
  isAdmin(user: AuthenticatedUser): boolean {
    return user.roles.includes(ROLES.ADMIN);
  }

  isSharedUser(user: AuthenticatedUser): boolean {
    return user.roles.includes(ROLES.UTILISATEUR_PARTAGE);
  }

  isManagerOnly(user: AuthenticatedUser): boolean {
    return (
      user.roles.includes(ROLES.GESTIONNAIRE) &&
      !user.roles.includes(ROLES.ADMIN) &&
      !user.roles.includes(ROLES.CONSULTANT)
    );
  }

  /**
   * Filtre des terrains visibles par l'utilisateur.
   *
   * - ADMIN / CONSULTANT : tout le patrimoine non supprimé
   * - GESTIONNAIRE : uniquement les biens qui lui sont attribués
   * - UTILISATEUR_PARTAGE : uniquement les biens partagés, actifs et non expirés
   */
  propertyFilter(user: AuthenticatedUser): Prisma.PropertyWhereInput {
    const base: Prisma.PropertyWhereInput = { deletedAt: null };

    if (this.isSharedUser(user)) {
      return {
        ...base,
        shares: {
          some: {
            userId: user.id,
            status: 'ACTIVE',
            expiresAt: { gt: new Date() },
          },
        },
      };
    }

    if (this.isManagerOnly(user)) {
      return {
        ...base,
        managers: { some: { userId: user.id } },
      };
    }

    return base;
  }

  /**
   * Filtre des projets visibles.
   *
   * Un gestionnaire voit les projets dont il est responsable *ou* rattachés à un
   * terrain qu'il gère : sans cette seconde branche, il perdrait la vue sur les
   * projets de ses propres domaines.
   */
  projectFilter(user: AuthenticatedUser): Prisma.ProjectWhereInput {
    const base: Prisma.ProjectWhereInput = { deletedAt: null };

    // §22 — l'utilisateur partagé n'a aucun accès aux projets.
    if (this.isSharedUser(user)) {
      return { ...base, id: { in: [] } };
    }

    if (this.isManagerOnly(user)) {
      return {
        ...base,
        OR: [
          { managerId: user.id },
          { property: { managers: { some: { userId: user.id } } } },
        ],
      };
    }

    return base;
  }

  /** Filtre des documents de terrains, dérivé du périmètre des terrains. */
  propertyDocumentFilter(
    user: AuthenticatedUser,
  ): Prisma.PropertyDocumentWhereInput {
    return {
      deletedAt: null,
      property: this.propertyFilter(user),
    };
  }

  /** Filtre des documents de projets, dérivé du périmètre des projets. */
  projectDocumentFilter(
    user: AuthenticatedUser,
  ): Prisma.ProjectDocumentWhereInput {
    return {
      deletedAt: null,
      project: this.projectFilter(user),
    };
  }

  /**
   * Fusionne le périmètre et les filtres de la requête dans un `AND` explicite.
   *
   * Passer par un `AND` évite qu'un filtre utilisateur portant sur la même clé
   * (`shares`, `managers`…) n'écrase silencieusement la contrainte de périmètre.
   */
  merge<T extends object>(scope: T, filters: T): T {
    return { AND: [scope, filters] } as unknown as T;
  }
}
