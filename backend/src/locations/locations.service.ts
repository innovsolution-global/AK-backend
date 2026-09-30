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
import {
  GUINEA_LOCALITIES,
  GUINEA_REGIONS,
  normalizeLocalityName,
} from './guinea-localities';

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

  /**
   * Découpage administratif officiel (§6), enrichi de l'état de la base :
   * chaque localité indique si elle est déjà enregistrée. Le formulaire de
   * création s'en sert pour proposer les localités manquantes plutôt que de
   * laisser ressaisir des noms au risque des fautes et des doublons.
   */
  async findReference() {
    const existing = await this.prisma.location.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, code: true },
    });

    const byName = new Map(existing.map((row) => [normalizeLocalityName(row.name), row]));
    const byCode = new Map(existing.map((row) => [row.code.toUpperCase(), row]));

    return {
      regions: GUINEA_REGIONS,
      localities: GUINEA_LOCALITIES.map((locality) => {
        const match =
          byName.get(normalizeLocalityName(locality.name)) ?? byCode.get(locality.code);

        return {
          ...locality,
          existingId: match?.id ?? null,
          // Le code retenu est celui déjà en base quand la localité existe :
          // l'afficher évite de croire à un doublon là où il n'y en a pas.
          code: match?.code ?? locality.code,
        };
      }),
    };
  }

  /**
   * Importe les localités officielles absentes de la base.
   *
   * Idempotent : la comparaison porte sur le nom normalisé (sans accents ni
   * ponctuation) **et** sur le code, si bien qu'un second appel ne crée rien.
   * Les communes de Conakry sont rattachées à leur zone spéciale, créée
   * d'abord pour que le lien parent existe.
   */
  async importReference(actor: AuthenticatedUser, context: RequestContext) {
    // Les localités supprimées sont incluses : leur code reste réservé, on les
    // restaure plutôt que d'échouer sur un conflit d'unicité.
    const existing = await this.prisma.location.findMany({
      select: { id: true, name: true, code: true, deletedAt: true },
    });

    const live = existing.filter((row) => row.deletedAt === null);
    const byName = new Map(live.map((row) => [normalizeLocalityName(row.name), row.id]));
    const byCode = new Map(live.map((row) => [row.code.toUpperCase(), row.id]));
    const deletedByCode = new Map(
      existing
        .filter((row) => row.deletedAt !== null)
        .map((row) => [row.code.toUpperCase(), row.id]),
    );
    const idByCode = new Map<string, string>();

    for (const row of live) idByCode.set(row.code.toUpperCase(), row.id);

    const created: string[] = [];
    const skipped: string[] = [];

    // Les parents (Conakry) d'abord : une commune ne peut pas pointer vers une
    // localité qui n'existe pas encore.
    const ordered = [...GUINEA_LOCALITIES].sort(
      (a, b) => Number(Boolean(a.parentCode)) - Number(Boolean(b.parentCode)),
    );

    for (const locality of ordered) {
      const known =
        byName.get(normalizeLocalityName(locality.name)) ?? byCode.get(locality.code);

      if (known) {
        idByCode.set(locality.code, known);
        skipped.push(locality.name);
        continue;
      }

      const parentId = locality.parentCode
        ? idByCode.get(locality.parentCode)
        : undefined;
      const deletedId = deletedByCode.get(locality.code);

      const data = {
        name: locality.name,
        code: locality.code,
        type: locality.type,
        region: locality.region,
        parentId: parentId ?? null,
        country: 'GN',
      };

      const row = deletedId
        ? await this.prisma.location.update({
            where: { id: deletedId },
            data: { ...data, deletedAt: null, deletedById: null },
            select: { id: true },
          })
        : await this.prisma.location.create({ data, select: { id: true } });

      idByCode.set(locality.code, row.id);
      byName.set(normalizeLocalityName(locality.name), row.id);
      byCode.set(locality.code, row.id);
      created.push(locality.name);
    }

    if (created.length > 0) {
      await this.audit.record({
        userId: actor.id,
        action: AuditAction.CREATE,
        entity: 'Location',
        entityId: 'guinea-reference',
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { imported: created.length, source: 'REFERENTIEL_GUINEE' },
      });
    }

    return {
      created: created.length,
      skipped: skipped.length,
      createdNames: created,
    };
  }

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

    if (existing && !existing.deletedAt) {
      throw new ConflictException({
        message: 'Ce code est déjà utilisé.',
        error: 'CONFLICT',
        details: [{ field: 'code', message: 'Code déjà utilisé' }],
      });
    }

    // Une localité supprimée conserve son code (contrainte d'unicité globale) :
    // la recréer à l'identique la **restaure** avec les valeurs fournies, au
    // lieu d'un conflit que l'utilisateur ne pourrait pas résoudre. Les sites
    // et terrains supprimés avec elle, eux, restent supprimés.
    if (existing?.deletedAt) {
      const restored = await this.prisma.location.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          deletedById: null,
          name: dto.name,
          type: dto.type,
          parentId: dto.parentId ?? null,
          country: dto.country ?? 'GN',
          region: dto.region ?? null,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          description: dto.description ?? null,
        },
        select: LOCATION_SELECT,
      });

      await this.audit.record({
        userId: actor.id,
        action: AuditAction.UPDATE,
        entity: 'Location',
        entityId: restored.id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { restored: true, code: dto.code },
      });

      return restored;
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
        dto.parentId === null
          ? undefined
          : (dto.parentId ?? current.parentId ?? undefined),
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
