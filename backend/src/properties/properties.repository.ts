import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/services/scope.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { QueryPropertiesDto } from './dto/property.dto';

/** Projection de liste : volontairement légère, sans documents ni partages. */
export const PROPERTY_LIST_SELECT = {
  id: true,
  reference: true,
  name: true,
  area: true,
  areaUnit: true,
  areaSqm: true,
  status: true,
  purchaseDate: true,
  createdAt: true,
  updatedAt: true,
  location: { select: { id: true, name: true, code: true } },
  site: { select: { id: true, name: true, code: true } },
  coordinates: {
    where: { isPrimary: true },
    select: { latitude: true, longitude: true },
    take: 1,
  },
  managers: {
    select: {
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  _count: {
    select: {
      documents: { where: { deletedAt: null, isCurrentVersion: true } },
      geoFiles: { where: { deletedAt: null } },
      projects: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.PropertySelect;

/** Projection de détail : ajoute les champs internes et les coordonnées. */
export const PROPERTY_DETAIL_SELECT = {
  ...PROPERTY_LIST_SELECT,
  description: true,
  notes: true,
  sellerName: true,
  sellerContact: true,
  googleMapsUrl: true,
  googleEarthUrl: true,
  coordinates: {
    select: {
      id: true,
      label: true,
      latitude: true,
      longitude: true,
      altitude: true,
      pointOrder: true,
      isPrimary: true,
    },
    orderBy: [{ isPrimary: 'desc' }, { pointOrder: 'asc' }],
  },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  updatedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.PropertySelect;

const SORTABLE = [
  'reference',
  'name',
  'areaSqm',
  'status',
  'purchaseDate',
  'createdAt',
  'updatedAt',
] as const;

@Injectable()
export class PropertiesRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * Construit le `where` d'une liste.
   *
   * Le périmètre de l'utilisateur et les filtres de la requête sont combinés
   * dans un `AND` : un filtre client ne peut donc pas écraser la contrainte de
   * périmètre, même s'il porte sur la même clé.
   */
  buildWhere(
    user: AuthenticatedUser,
    query: QueryPropertiesDto,
  ): Prisma.PropertyWhereInput {
    const filters: Prisma.PropertyWhereInput = {};

    if (query.status) filters.status = query.status;
    if (query.locationId) filters.locationId = query.locationId;
    if (query.siteId) filters.siteId = query.siteId;

    if (query.managerId) {
      filters.managers = { some: { userId: query.managerId } };
    }

    if (query.minArea !== undefined || query.maxArea !== undefined) {
      filters.areaSqm = {
        gte: query.minArea,
        lte: query.maxArea,
      };
    }

    if (query.purchasedFrom || query.purchasedTo) {
      filters.purchaseDate = {
        gte: query.purchasedFrom ? new Date(query.purchasedFrom) : undefined,
        lte: query.purchasedTo ? new Date(query.purchasedTo) : undefined,
      };
    }

    if (query.hasCoordinates !== undefined) {
      filters.coordinates = query.hasCoordinates ? { some: {} } : { none: {} };
    }

    if (query.hasDocuments !== undefined) {
      const condition = { deletedAt: null };
      filters.documents = query.hasDocuments
        ? { some: condition }
        : { none: condition };
    }

    if (query.search) {
      filters.OR = [
        { reference: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
        { sellerName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return { AND: [this.scope.propertyFilter(user), filters] };
  }

  async findPage(user: AuthenticatedUser, query: QueryPropertiesDto) {
    const where = this.buildWhere(user, query);

    return this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        select: PROPERTY_LIST_SELECT,
        orderBy: query.buildOrderBy(SORTABLE, 'createdAt'),
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.property.count({ where }),
    ]);
  }

  /**
   * Charge un terrain **dans le périmètre de l'utilisateur**.
   * Renvoie `null` si le bien existe mais est hors périmètre : l'appelant
   * répond alors `404`, sans révéler son existence.
   */
  findOneInScope(user: AuthenticatedUser, id: string) {
    return this.prisma.property.findFirst({
      where: { AND: [this.scope.propertyFilter(user), { id }] },
      select: PROPERTY_DETAIL_SELECT,
    });
  }

  existsInScope(user: AuthenticatedUser, id: string): Promise<boolean> {
    return this.prisma.property
      .count({ where: { AND: [this.scope.propertyFilter(user), { id }] } })
      .then((count) => count > 0);
  }

  /** Markers de la carte : projection minimale, sans pagination (§11). */
  findForMap(user: AuthenticatedUser, filters: Prisma.PropertyWhereInput = {}) {
    return this.prisma.property.findMany({
      where: {
        AND: [
          this.scope.propertyFilter(user),
          filters,
          { coordinates: { some: { isPrimary: true } } },
        ],
      },
      select: {
        id: true,
        reference: true,
        name: true,
        status: true,
        areaSqm: true,
        areaUnit: true,
        area: true,
        location: { select: { id: true, name: true } },
        site: { select: { id: true, name: true } },
        coordinates: {
          where: { isPrimary: true },
          select: { latitude: true, longitude: true },
          take: 1,
        },
      },
    });
  }
}
