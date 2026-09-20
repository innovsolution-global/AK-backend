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
    ] = await this.prisma.$transaction([
      this.prisma.property.count({ where: propertyScope }),
      this.prisma.property.aggregate({
        where: propertyScope,
        _sum: { areaSqm: true },
      }),
      this.prisma.property.groupBy({
        by: ['status'],
        where: propertyScope,
        _count: { _all: true },
      }),
      this.prisma.location.count({ where: { deletedAt: null } }),
      this.prisma.site.count({ where: { deletedAt: null } }),
      this.prisma.project.count({ where: projectScope }),
      this.prisma.project.groupBy({
        by: ['status'],
        where: projectScope,
        _count: { _all: true },
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

    const [byStatus, byLocation, largest, recent] = await this.prisma.$transaction([
      this.prisma.property.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        _sum: { areaSqm: true },
      }),
      this.prisma.property.groupBy({
        by: ['locationId'],
        where,
        _count: { _all: true },
        _sum: { areaSqm: true },
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

    const [byStatus, byCompany, recent, permits] = await this.prisma.$transaction([
      this.prisma.project.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.project.groupBy({
        by: ['companyId'],
        where: { ...where, companyId: { not: null } },
        _count: { _all: true },
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

  /** Volumétrie documentaire (§28). */
  async documents(user: AuthenticatedUser) {
    const propertyScope = this.scope.propertyFilter(user);
    const projectScope = this.scope.projectFilter(user);

    const [byType, sizeAggregate, projectByType, recent] =
      await this.prisma.$transaction([
        this.prisma.propertyDocument.groupBy({
          by: ['type'],
          where: {
            deletedAt: null,
            isCurrentVersion: true,
            property: propertyScope,
          },
          _count: { _all: true },
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

export type { Prisma };
