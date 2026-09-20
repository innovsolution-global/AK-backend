import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResult } from '../common/dto/paginated-result';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type { CreateSiteDto, QuerySitesDto, UpdateSiteDto } from './dto/site.dto';

const SITE_SELECT = {
  id: true,
  name: true,
  code: true,
  description: true,
  latitude: true,
  longitude: true,
  createdAt: true,
  updatedAt: true,
  location: { select: { id: true, name: true, code: true, type: true } },
  _count: { select: { properties: true, projects: true } },
} satisfies Prisma.SiteSelect;

const SORTABLE = ['name', 'code', 'createdAt'] as const;

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: QuerySitesDto) {
    const where: Prisma.SiteWhereInput = { deletedAt: null };

    if (query.locationId) where.locationId = query.locationId;

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.site.findMany({
        where,
        select: SITE_SELECT,
        orderBy: query.buildOrderBy(SORTABLE, 'name'),
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.site.count({ where }),
    ]);

    return PaginatedResult.from(items, total, query);
  }

  async findOne(id: string) {
    const site = await this.prisma.site.findFirst({
      where: { id, deletedAt: null },
      select: SITE_SELECT,
    });

    if (!site) throw this.notFound();
    return site;
  }

  async create(
    dto: CreateSiteDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    await this.assertLocationExists(dto.locationId);
    await this.assertCodeIsFree(dto.code);

    const site = await this.prisma.site.create({
      data: {
        locationId: dto.locationId,
        name: dto.name,
        code: dto.code,
        description: dto.description,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
      select: SITE_SELECT,
    });

    await this.audit.record({
      userId: actor.id,
      action: AuditAction.CREATE,
      entity: 'Site',
      entityId: site.id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { code: dto.code, locationId: dto.locationId },
    });

    return site;
  }

  async update(
    id: string,
    dto: UpdateSiteDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    await this.findOne(id);

    if (dto.locationId) {
      await this.assertLocationExists(dto.locationId);
      await this.assertNoAttachedPropertiesOnMove(id);
    }

    const site = await this.prisma.site.update({
      where: { id },
      data: {
        locationId: dto.locationId,
        name: dto.name,
        description: dto.description,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
      select: SITE_SELECT,
    });

    await this.audit.record({
      userId: actor.id,
      action: AuditAction.UPDATE,
      entity: 'Site',
      entityId: id,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return site;
  }

  async remove(
    id: string,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<void> {
    const site = await this.prisma.site.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        _count: {
          select: {
            properties: { where: { deletedAt: null } },
            projects: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!site) throw this.notFound();

    const { properties, projects } = site._count;

    if (properties > 0 || projects > 0) {
      throw new ConflictException({
        message: `Suppression impossible : ce site porte ${properties} terrain(s) et ${projects} projet(s) actifs.`,
        error: 'CONFLICT',
      });
    }

    await this.prisma.site.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actor.id },
    });

    await this.audit.record({
      userId: actor.id,
      action: AuditAction.DELETE,
      entity: 'Site',
      entityId: id,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  // --- Règles internes ------------------------------------------------------

  private async assertLocationExists(locationId: string): Promise<void> {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, deletedAt: null },
      select: { id: true },
    });

    if (!location) {
      throw new BadRequestException({
        message: "La ville de rattachement n'existe pas.",
        error: 'VALIDATION_ERROR',
        details: [{ field: 'locationId', message: 'Localité introuvable' }],
      });
    }
  }

  private async assertCodeIsFree(code: string): Promise<void> {
    const existing = await this.prisma.site.findUnique({
      where: { code },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException({
        message: 'Ce code de site est déjà utilisé.',
        error: 'CONFLICT',
        details: [{ field: 'code', message: 'Code déjà utilisé' }],
      });
    }
  }

  /**
   * Déplacer un site vers une autre ville désynchroniserait les terrains qu'il
   * porte, dont la ville est stockée séparément. On refuse le déplacement tant
   * que des terrains y sont rattachés.
   */
  private async assertNoAttachedPropertiesOnMove(siteId: string): Promise<void> {
    const attached = await this.prisma.property.count({
      where: { siteId, deletedAt: null },
    });

    if (attached > 0) {
      throw new ConflictException({
        message: `Ce site porte ${attached} terrain(s) : sa ville de rattachement ne peut plus être modifiée.`,
        error: 'CONFLICT',
        details: [{ field: 'locationId', message: 'Site non déplaçable' }],
      });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      message: "Ce site n'existe pas.",
      error: 'NOT_FOUND',
    });
  }
}
