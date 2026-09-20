import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, LocationType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResult } from '../common/dto/paginated-result';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type {
  CreateLocationDto,
  QueryLocationsDto,
  UpdateLocationDto,
} from './dto/location.dto';

const LOCATION_SELECT = {
  id: true,
  name: true,
  code: true,
  type: true,
  parentId: true,
  country: true,
  region: true,
  latitude: true,
  longitude: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  parent: { select: { id: true, name: true, code: true, type: true } },
  _count: { select: { sites: true, properties: true } },
} satisfies Prisma.LocationSelect;

const SORTABLE = ['name', 'code', 'type', 'createdAt'] as const;

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: QueryLocationsDto) {
    const where: Prisma.LocationWhereInput = { deletedAt: null };

    if (query.type) where.type = query.type;
    if (query.parentId) where.parentId = query.parentId;

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.location.findMany({
        where,
        select: LOCATION_SELECT,
        orderBy: query.buildOrderBy(SORTABLE, 'name'),
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.location.count({ where }),
    ]);

    return PaginatedResult.from(items, total, query);
  }

  async findOne(id: string) {
    const location = await this.prisma.location.findFirst({
      where: { id, deletedAt: null },
      select: LOCATION_SELECT,
    });

    if (!location) throw this.notFound();
    return location;
  }

  /** Sites rattachés à une ville — utilisé pour les sélecteurs en cascade. */
  async findSites(id: string) {
    await this.findOne(id);

    return this.prisma.site.findMany({
      where: { locationId: id, deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        latitude: true,
        longitude: true,
        _count: { select: { properties: true } },
      },
    });
  }

  async create(
    dto: CreateLocationDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    await this.assertParentIsValid(dto.type, dto.parentId);

    const existing = await this.prisma.location.findUnique({
      where: { code: dto.code },
      select: { id: true, deletedAt: true },
    });

    if (existing) {
      throw new ConflictException({
        message: existing.deletedAt
          ? 'Ce code est utilisé par une localité supprimée.'
          : 'Ce code est déjà utilisé.',
        error: 'CONFLICT',
        details: [{ field: 'code', message: 'Code déjà utilisé' }],
      });
    }

    const location = await this.prisma.location.create({
      data: {
        name: dto.name,
        code: dto.code,
        type: dto.type,
        parentId: dto.parentId,
        country: dto.country ?? 'GN',
        region: dto.region,
        latitude: dto.latitude,
        longitude: dto.longitude,
        description: dto.description,
      },
      select: LOCATION_SELECT,
    });

    await this.audit.record({
      userId: actor.id,
      action: AuditAction.CREATE,
      entity: 'Location',
      entityId: location.id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { code: dto.code, type: dto.type },
    });

    return location;
  }

  async update(
    id: string,
    dto: UpdateLocationDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    const current = await this.findOne(id);

    if (dto.parentId !== undefined || dto.type !== undefined) {
      await this.assertParentIsValid(
        dto.type ?? current.type,
        dto.parentId === null ? undefined : dto.parentId ?? current.parentId ?? undefined,
        id,
      );
    }

    const location = await this.prisma.location.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        parentId: dto.parentId === null ? null : dto.parentId,
        region: dto.region,
        latitude: dto.latitude,
        longitude: dto.longitude,
        description: dto.description,
      },
      select: LOCATION_SELECT,
    });

    await this.audit.record({
      userId: actor.id,
      action: AuditAction.UPDATE,
      entity: 'Location',
      entityId: id,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return location;
  }

  /**
   * Soft delete, refusé tant que la localité porte des sites, terrains ou
   * projets actifs : la supprimer rendrait ces ressources orphelines de leur
   * rattachement géographique.
   */
  async remove(
    id: string,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<void> {
    const location = await this.prisma.location.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        _count: {
          select: {
            sites: { where: { deletedAt: null } },
            properties: { where: { deletedAt: null } },
            projects: { where: { deletedAt: null } },
            children: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!location) throw this.notFound();

    const { sites, properties, projects, children } = location._count;
    const blockers: string[] = [];

    if (sites > 0) blockers.push(`${sites} site(s)`);
    if (properties > 0) blockers.push(`${properties} terrain(s)`);
    if (projects > 0) blockers.push(`${projects} projet(s)`);
    if (children > 0) blockers.push(`${children} localité(s) rattachée(s)`);

    if (blockers.length > 0) {
      throw new ConflictException({
        message: `Suppression impossible : cette localité contient ${blockers.join(', ')}.`,
        error: 'CONFLICT',
      });
    }

    await this.prisma.location.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actor.id },
    });

    await this.audit.record({
      userId: actor.id,
      action: AuditAction.DELETE,
      entity: 'Location',
      entityId: id,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  // --- Règles internes ------------------------------------------------------

  /**
   * Vérifie la cohérence de la hiérarchie Préfecture → Ville → Commune (§6) et
   * l'absence de cycle : une localité ne peut pas devenir son propre ancêtre.
   */
  private async assertParentIsValid(
    type: LocationType,
    parentId: string | undefined,
    selfId?: string,
  ): Promise<void> {
    if (!parentId) {
      if (type !== LocationType.PREFECTURE && type !== LocationType.VILLE) {
        throw new BadRequestException({
          message: 'Une commune doit être rattachée à une ville.',
          error: 'VALIDATION_ERROR',
          details: [{ field: 'parentId', message: 'Parent requis' }],
        });
      }
      return;
    }

    if (selfId && parentId === selfId) {
      throw new BadRequestException({
        message: 'Une localité ne peut pas être son propre parent.',
        error: 'VALIDATION_ERROR',
        details: [{ field: 'parentId', message: 'Référence circulaire' }],
      });
    }

    const parent = await this.prisma.location.findFirst({
      where: { id: parentId, deletedAt: null },
      select: { id: true, type: true, parentId: true },
    });

    if (!parent) {
      throw new BadRequestException({
        message: "La localité parente n'existe pas.",
        error: 'VALIDATION_ERROR',
        details: [{ field: 'parentId', message: 'Parent introuvable' }],
      });
    }

    const EXPECTED_PARENT: Record<LocationType, LocationType | null> = {
      [LocationType.PREFECTURE]: null,
      [LocationType.VILLE]: LocationType.PREFECTURE,
      [LocationType.COMMUNE]: LocationType.VILLE,
    };

    const expected = EXPECTED_PARENT[type];

    if (expected === null) {
      throw new BadRequestException({
        message: 'Une préfecture ne peut pas avoir de parent.',
        error: 'VALIDATION_ERROR',
        details: [{ field: 'parentId', message: 'Parent non autorisé' }],
      });
    }

    if (parent.type !== expected) {
      throw new BadRequestException({
        message: `Une localité de type ${type} doit être rattachée à une localité de type ${expected}.`,
        error: 'VALIDATION_ERROR',
        details: [{ field: 'parentId', message: 'Type de parent incorrect' }],
      });
    }

    // Remonte la chaîne pour écarter un cycle introduit par un déplacement.
    if (selfId) {
      let cursor = parent.parentId;
      let depth = 0;

      while (cursor && depth < 10) {
        if (cursor === selfId) {
          throw new BadRequestException({
            message: 'Ce rattachement créerait une hiérarchie circulaire.',
            error: 'VALIDATION_ERROR',
            details: [{ field: 'parentId', message: 'Référence circulaire' }],
          });
        }

        const ancestor: { parentId: string | null } | null =
          await this.prisma.location.findUnique({
            where: { id: cursor },
            select: { parentId: true },
          });

        cursor = ancestor?.parentId ?? null;
        depth += 1;
      }
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      message: "Cette localité n'existe pas.",
      error: 'NOT_FOUND',
    });
  }
}
