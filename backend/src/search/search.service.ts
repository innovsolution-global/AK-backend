import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/services/scope.service';
import { PERMISSIONS } from '../common/constants/rbac.constants';
import { hasPermission } from '../common/types/authenticated-user';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

export type SearchEntity =
  | 'property'
  | 'project'
  | 'site'
  | 'location'
  | 'document'
  | 'company';

export interface SearchHit {
  entity: SearchEntity;
  id: string;
  title: string;
  subtitle: string | null;
  badge: string | null;
  /** Chemin frontend vers la fiche. */
  path: string;
}

/** Nombre de résultats par catégorie : une recherche globale oriente, elle ne liste pas. */
const LIMIT_PER_ENTITY = 5;

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * Recherche globale (§24).
   *
   * Chaque catégorie est interrogée **dans le périmètre de l'utilisateur** et
   * sous réserve de la permission correspondante : la recherche ne doit jamais
   * devenir un moyen détourné de découvrir des ressources inaccessibles.
   */
  async search(user: AuthenticatedUser, term: string): Promise<{
    query: string;
    total: number;
    results: SearchHit[];
  }> {
    const query = term.trim();

    // En dessous de deux caractères, la recherche ramènerait presque tout :
    // autant ne rien renvoyer que de donner une liste sans valeur.
    if (query.length < 2) {
      return { query, total: 0, results: [] };
    }

    const contains = { contains: query, mode: 'insensitive' } as const;
    const tasks: Array<Promise<SearchHit[]>> = [];

    if (hasPermission(user, PERMISSIONS.PROPERTY_READ)) {
      tasks.push(this.searchProperties(user, contains));
    }
    if (hasPermission(user, PERMISSIONS.PROJECT_READ)) {
      tasks.push(this.searchProjects(user, contains));
    }
    if (hasPermission(user, PERMISSIONS.SITE_READ)) {
      tasks.push(this.searchSites(contains));
      tasks.push(this.searchLocations(contains));
    }
    if (hasPermission(user, PERMISSIONS.DOCUMENT_READ)) {
      tasks.push(this.searchDocuments(user, contains));
    }
    if (hasPermission(user, PERMISSIONS.COMPANY_READ)) {
      tasks.push(this.searchCompanies(contains));
    }

    const results = (await Promise.all(tasks)).flat();

    return { query, total: results.length, results };
  }

  private async searchProperties(
    user: AuthenticatedUser,
    contains: { contains: string; mode: 'insensitive' },
  ): Promise<SearchHit[]> {
    const rows = await this.prisma.property.findMany({
      where: {
        AND: [
          this.scope.propertyFilter(user),
          { OR: [{ reference: contains }, { name: contains }, { sellerName: contains }] },
        ],
      },
      take: LIMIT_PER_ENTITY,
      orderBy: { reference: 'asc' },
      select: {
        id: true,
        reference: true,
        name: true,
        status: true,
        location: { select: { name: true } },
        site: { select: { name: true } },
      },
    });

    return rows.map((row) => ({
      entity: 'property' as const,
      id: row.id,
      title: `${row.reference} — ${row.name}`,
      subtitle: [row.location.name, row.site?.name].filter(Boolean).join(' · '),
      badge: row.status,
      path: `/properties/${row.id}`,
    }));
  }

  private async searchProjects(
    user: AuthenticatedUser,
    contains: { contains: string; mode: 'insensitive' },
  ): Promise<SearchHit[]> {
    const rows = await this.prisma.project.findMany({
      where: {
        AND: [
          this.scope.projectFilter(user),
          { OR: [{ reference: contains }, { name: contains }] },
        ],
      },
      take: LIMIT_PER_ENTITY,
      orderBy: { reference: 'asc' },
      select: {
        id: true,
        reference: true,
        name: true,
        status: true,
        location: { select: { name: true } },
      },
    });

    return rows.map((row) => ({
      entity: 'project' as const,
      id: row.id,
      title: `${row.reference} — ${row.name}`,
      subtitle: row.location.name,
      badge: row.status,
      path: `/projects/${row.id}`,
    }));
  }

  private async searchSites(contains: {
    contains: string;
    mode: 'insensitive';
  }): Promise<SearchHit[]> {
    const rows = await this.prisma.site.findMany({
      where: {
        deletedAt: null,
        OR: [{ name: contains }, { code: contains }],
      },
      take: LIMIT_PER_ENTITY,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        location: { select: { name: true } },
        _count: { select: { properties: { where: { deletedAt: null } } } },
      },
    });

    return rows.map((row) => ({
      entity: 'site' as const,
      id: row.id,
      title: row.name,
      subtitle: `${row.location.name} · ${row._count.properties} terrain(s)`,
      badge: row.code,
      path: `/sites?siteId=${row.id}`,
    }));
  }

  private async searchLocations(contains: {
    contains: string;
    mode: 'insensitive';
  }): Promise<SearchHit[]> {
    const rows = await this.prisma.location.findMany({
      where: {
        deletedAt: null,
        OR: [{ name: contains }, { code: contains }],
      },
      take: LIMIT_PER_ENTITY,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        type: true,
        _count: { select: { properties: { where: { deletedAt: null } } } },
      },
    });

    return rows.map((row) => ({
      entity: 'location' as const,
      id: row.id,
      title: row.name,
      subtitle: `${row._count.properties} terrain(s)`,
      badge: row.type,
      path: `/locations?locationId=${row.id}`,
    }));
  }

  private async searchDocuments(
    user: AuthenticatedUser,
    contains: { contains: string; mode: 'insensitive' },
  ): Promise<SearchHit[]> {
    const rows = await this.prisma.propertyDocument.findMany({
      where: {
        deletedAt: null,
        isCurrentVersion: true,
        property: this.scope.propertyFilter(user),
        OR: [{ name: contains }, { fileName: contains }],
      },
      take: LIMIT_PER_ENTITY,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        type: true,
        property: { select: { id: true, reference: true } },
      },
    });

    return rows.map((row) => ({
      entity: 'document' as const,
      id: row.id,
      title: row.name,
      subtitle: row.property.reference,
      badge: row.type,
      path: `/properties/${row.property.id}?tab=documents`,
    }));
  }

  private async searchCompanies(contains: {
    contains: string;
    mode: 'insensitive';
  }): Promise<SearchHit[]> {
    const rows = await this.prisma.company.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: contains },
          { registrationNumber: contains },
          { contactPerson: contains },
        ],
      },
      take: LIMIT_PER_ENTITY,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        contactPerson: true,
        _count: { select: { projects: { where: { deletedAt: null } } } },
      },
    });

    return rows.map((row) => ({
      entity: 'company' as const,
      id: row.id,
      title: row.name,
      subtitle: row.contactPerson,
      badge: `${row._count.projects} projet(s)`,
      path: `/companies/${row.id}`,
    }));
  }
}
