import { Injectable } from '@nestjs/common';
import { Prisma, PropertyStatus, ProjectStatus, ShareStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/services/scope.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

/** Une entrée de répartition : libellé, effectif, part du total. */
export interface Breakdown {
  key: string;
  count: number;
  percentage: number;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * Indicateurs de synthèse (§28).
   *
   * Tous les comptages passent par le périmètre de l'utilisateur : un
   * gestionnaire voit les totaux de *ses* biens, pas ceux du patrimoine entier.
   */
  async overview(user: AuthenticatedUser) {
    const propertyScope = this.scope.propertyFilter(user);
    const projectScope = this.scope.projectFilter(user);

    const [
      propertyCount,
      areaAggregate,
      statusGroups,
      locationCount,
      siteCount,
      projectCount,
      projectStatusGroups,
      documentCount,
      geoFileCount,
      activeShares,
      expiringShares,
      // Lecture seule : `Promise.all` plutôt que `$transaction`, qui
      // immobiliserait une connexion pour toute la série sans rien garantir de
      // plus sur un instantané d'indicateurs.
    ] = await Promise.all([
      this.prisma.property.count({ where: propertyScope }),
      this.prisma.property.aggregate({
        where: propertyScope,
        _sum: { areaSqm: true },
      }),
      this.prisma.property.groupBy({
        by: ['status'],
        where: propertyScope,
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.location.count({ where: { deletedAt: null } }),
      this.prisma.site.count({ where: { deletedAt: null } }),
      this.prisma.project.count({ where: projectScope }),
      this.prisma.project.groupBy({
        by: ['status'],
        where: projectScope,
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.propertyDocument.count({
        where: {
          deletedAt: null,
          isCurrentVersion: true,
          property: propertyScope,
        },
      }),
      this.prisma.propertyGeoFile.count({
        where: { deletedAt: null, property: propertyScope },
      }),
      this.prisma.propertyShare.count({
        where: {
          status: ShareStatus.ACTIVE,
          expiresAt: { gt: new Date() },
          property: propertyScope,
        },
      }),
      this.prisma.propertyShare.count({
        where: {
          status: ShareStatus.ACTIVE,
          expiresAt: {
            gt: new Date(),
            lte: new Date(Date.now() + 7 * 86_400_000),
          },
          property: propertyScope,
        },
      }),
    ]);

    const totalSqm = Number(areaAggregate._sum.areaSqm ?? 0);

    return {
      properties: {
        total: propertyCount,
        totalAreaSqm: totalSqm,
        totalAreaHectares: Math.round((totalSqm / 10_000) * 100) / 100,
        byStatus: this.toBreakdown(
          statusGroups.map((group) => ({
            key: group.status,
            count: group._count._all,
          })),
          propertyCount,
          Object.values(PropertyStatus),
        ),
      },
      geography: { locations: locationCount, sites: siteCount },
      projects: {
        total: projectCount,
        byStatus: this.toBreakdown(
          projectStatusGroups.map((group) => ({
            key: group.status,
            count: group._count._all,
          })),
          projectCount,
          Object.values(ProjectStatus),
        ),
      },
      documents: { total: documentCount, geoFiles: geoFileCount },
      shares: { active: activeShares, expiringSoon: expiringShares },
    };
  }

  /** Répartition détaillée des terrains (§28). */
  async properties(user: AuthenticatedUser) {
    const where = this.scope.propertyFilter(user);

    const [byStatus, byLocation, largest, recent] = await Promise.all([
      this.prisma.property.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        _sum: { areaSqm: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.property.groupBy({
        by: ['locationId'],
        where,
        _count: { _all: true },
        _sum: { areaSqm: true },
        orderBy: { locationId: 'asc' },
      }),
      this.prisma.property.findMany({
        where,
        orderBy: { areaSqm: 'desc' },
        take: 5,
        select: {
          id: true,
          reference: true,
          name: true,
          areaSqm: true,
          status: true,
          location: { select: { name: true } },
        },
      }),
      this.prisma.property.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          reference: true,
          name: true,
          status: true,
          createdAt: true,
          location: { select: { name: true } },
        },
      }),
    ]);

    // `groupBy` ne joint pas : les noms de villes sont résolus en une requête
    // plutôt qu'une par groupe.
    const locations = await this.prisma.location.findMany({
      where: { id: { in: byLocation.map((group) => group.locationId) } },
      select: { id: true, name: true },
    });
    const locationNames = new Map(locations.map((l) => [l.id, l.name]));

    return {
      byStatus: byStatus.map((group) => ({
        status: group.status,
        count: group._count._all,
        areaSqm: Number(group._sum.areaSqm ?? 0),
      })),
      byLocation: byLocation
        .map((group) => ({
          locationId: group.locationId,
          locationName: locationNames.get(group.locationId) ?? 'Inconnue',
          count: group._count._all,
          areaSqm: Number(group._sum.areaSqm ?? 0),
        }))
        .sort((a, b) => b.count - a.count),
      largest,
      recent,
    };
  }

  /** Répartition et avancement des projets (§28). */
  async projects(user: AuthenticatedUser) {
    const where = this.scope.projectFilter(user);

    const [byStatus, byCompany, recent, permits] = await Promise.all([
      this.prisma.project.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.project.groupBy({
        by: ['companyId'],
        where: { ...where, companyId: { not: null } },
        _count: { _all: true },
        orderBy: { companyId: 'asc' },
      }),
      this.prisma.project.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          reference: true,
          name: true,
          status: true,
          updatedAt: true,
          property: { select: { reference: true } },
        },
      }),
      this.prisma.buildingPermit.groupBy({
        by: ['status'],
        where: { deletedAt: null, project: where },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
    ]);

    const companyIds = byCompany
      .map((group) => group.companyId)
      .filter((id): id is string => id !== null);

    const companies = await this.prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true },
    });
    const companyNames = new Map(companies.map((c) => [c.id, c.name]));

    return {
      byStatus: byStatus.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
      byCompany: byCompany.map((group) => ({
        companyId: group.companyId,
        companyName: group.companyId
          ? (companyNames.get(group.companyId) ?? 'Inconnue')
          : 'Non renseignée',
        count: group._count._all,
      })),
      permitsByStatus: permits.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
      recent,
    };
  }

  /**
   * Chronologie des acquisitions sur les `months` derniers mois.
   *
   * Les colonnes remontées sont minimales (date + superficie) : même pour des
   * milliers de terrains le transfert reste léger, et le regroupement en
   * mémoire évite de traduire le périmètre Prisma en SQL brut. Au-delà de
   * quelques dizaines de milliers de lignes, basculer sur un `GROUP BY
   * date_trunc` côté base.
   */
  async acquisitions(user: AuthenticatedUser, months = 24) {
    const since = new Date();
    since.setMonth(since.getMonth() - (months - 1), 1);
    since.setHours(0, 0, 0, 0);

    const rows = await this.prisma.property.findMany({
      where: {
        AND: [
          this.scope.propertyFilter(user),
          { purchaseDate: { not: null, gte: since } },
        ],
      },
      select: { purchaseDate: true, areaSqm: true },
    });

    // Tous les mois de la fenêtre sont émis, y compris ceux à zéro : une
    // courbe qui saute les mois vides ment sur le rythme d'acquisition.
    const buckets = new Map<string, { count: number; areaSqm: number }>();
    const cursor = new Date(since);

    for (let i = 0; i < months; i += 1) {
      buckets.set(monthKey(cursor), { count: 0, areaSqm: 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    for (const row of rows) {
      if (!row.purchaseDate) continue;
      const bucket = buckets.get(monthKey(row.purchaseDate));
      if (bucket) {
        bucket.count += 1;
        bucket.areaSqm += Number(row.areaSqm);
      }
    }

    let cumulative = 0;

    return [...buckets.entries()].map(([month, bucket]) => {
      cumulative += bucket.count;
      return {
        month,
        count: bucket.count,
        areaSqm: Math.round(bucket.areaSqm),
        cumulative,
      };
    });
  }

  /**
   * Activité récente et échéances (§27, §28).
   *
   * Un administrateur voit tout ; les autres rôles voient leurs propres actions,
   * pour ne pas transformer le tableau de bord en journal d'audit déguisé —
   * celui-ci a sa propre permission.
   */
  async activity(user: AuthenticatedUser) {
    const propertyScope = this.scope.propertyFilter(user);
    const now = new Date();
    const horizon = new Date(now.getTime() + 30 * 86_400_000);

    const [recentActivity, expiringShares, pendingShares] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: this.scope.isAdmin(user) ? {} : { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          metadata: true,
          createdAt: true,
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.propertyShare.findMany({
        where: {
          status: ShareStatus.ACTIVE,
          expiresAt: { gt: now, lte: horizon },
          property: propertyScope,
        },
        orderBy: { expiresAt: 'asc' },
        take: 8,
        select: {
          id: true,
          beneficiaryFirstName: true,
          beneficiaryLastName: true,
          beneficiaryEmail: true,
          expiresAt: true,
          lastAccessedAt: true,
          property: { select: { id: true, reference: true, name: true } },
        },
      }),
      this.prisma.propertyShare.count({
        where: {
          status: ShareStatus.PENDING,
          expiresAt: { gt: now },
          property: propertyScope,
        },
      }),
    ]);

    return { recentActivity, expiringShares, pendingShares };
  }

  /** Volumétrie documentaire (§28). */
  async documents(user: AuthenticatedUser) {
    const propertyScope = this.scope.propertyFilter(user);
    const projectScope = this.scope.projectFilter(user);

    const [byType, sizeAggregate, projectByType, recent] = await Promise.all([
      this.prisma.propertyDocument.groupBy({
        by: ['type'],
        where: {
          deletedAt: null,
          isCurrentVersion: true,
          property: propertyScope,
        },
        _count: { _all: true },
        orderBy: { type: 'asc' },
      }),
      this.prisma.propertyDocument.aggregate({
        where: { deletedAt: null, property: propertyScope },
        _sum: { size: true },
        _count: { _all: true },
      }),
      this.prisma.projectDocument.groupBy({
        by: ['type'],
        where: {
          deletedAt: null,
          isCurrentVersion: true,
          project: projectScope,
        },
        _count: { _all: true },
        orderBy: { type: 'asc' },
      }),
      this.prisma.propertyDocument.findMany({
        where: {
          deletedAt: null,
          isCurrentVersion: true,
          property: propertyScope,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          type: true,
          createdAt: true,
          property: { select: { id: true, reference: true } },
        },
      }),
    ]);

    return {
      propertyDocuments: {
        // Le total inclut toutes les versions : il reflète l'occupation réelle
        // du stockage, pas le nombre de documents distincts.
        totalVersions: sizeAggregate._count._all,
        totalSizeBytes: Number(sizeAggregate._sum.size ?? 0),
        byType: byType.map((group) => ({
          type: group.type,
          count: group._count._all,
        })),
      },
      projectDocuments: {
        byType: projectByType.map((group) => ({
          type: group.type,
          count: group._count._all,
        })),
      },
      recent,
    };
  }

  /**
   * Complète une répartition avec les valeurs d'énumération absentes.
   * Sans cela, un graphique afficherait un statut un jour et le ferait
   * disparaître le lendemain.
   */
  private toBreakdown(
    groups: Array<{ key: string; count: number }>,
    total: number,
    allKeys: readonly string[],
  ): Breakdown[] {
    const counts = new Map(groups.map((group) => [group.key, group.count]));

    return allKeys.map((key) => {
      const count = counts.get(key) ?? 0;

      return {
        key,
        count,
        percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      };
    });
  }
}

/** Clé `AAAA-MM`, indépendante du fuseau horaire du serveur. */
function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export type { Prisma };
