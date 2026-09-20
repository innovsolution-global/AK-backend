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
import { ReferenceService } from '../common/services/reference.service';
import { ScopeService } from '../common/services/scope.service';
import { toSquareMeters } from '../common/utils/area.util';
import { ROLES } from '../common/constants/rbac.constants';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type {
  AssignManagersDto,
  CoordinateDto,
  CreatePropertyDto,
  QueryPropertiesDto,
  ReplaceCoordinatesDto,
  UpdatePropertyDto,
} from './dto/property.dto';
import {
  PROPERTY_DETAIL_SELECT,
  PropertiesRepository,
} from './properties.repository';

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: PropertiesRepository,
    private readonly references: ReferenceService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async findAll(user: AuthenticatedUser, query: QueryPropertiesDto) {
    const [items, total] = await this.repository.findPage(user, query);

    return PaginatedResult.from(items, total, query);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const property = await this.repository.findOneInScope(user, id);

    if (!property) throw this.notFound();
    return property;
  }

  /**
   * Crée un terrain, ses coordonnées et l'affectation de ses gestionnaires
   * dans une seule transaction : un terrain ne doit jamais exister sans sa
   * référence ni avec des coordonnées partiellement écrites.
   */
  async create(
    dto: CreatePropertyDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    await this.assertGeographyIsConsistent(dto.locationId, dto.siteId);
    this.assertSinglePrimaryCoordinate(dto.coordinates);

    if (dto.managerIds?.length) {
      await this.assertManagersExist(dto.managerIds);
    }

    const property = await this.prisma.$transaction(async (tx) => {
      const reference = await this.references.nextPropertyReference(tx);

      const created = await tx.property.create({
        data: {
          reference,
          name: dto.name,
          locationId: dto.locationId,
          siteId: dto.siteId,
          area: dto.area,
          areaUnit: dto.areaUnit,
          areaSqm: toSquareMeters(dto.area, dto.areaUnit),
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
          sellerName: dto.sellerName,
          sellerContact: dto.sellerContact,
          status: dto.status,
          description: dto.description,
          notes: dto.notes,
          googleMapsUrl: dto.googleMapsUrl,
          googleEarthUrl: dto.googleEarthUrl,
          createdById: actor.id,
          updatedById: actor.id,
          coordinates: dto.coordinates?.length
            ? { create: this.toCoordinateRows(dto.coordinates) }
            : undefined,
          managers: dto.managerIds?.length
            ? {
                create: dto.managerIds.map((userId) => ({
                  userId,
                  assignedById: actor.id,
                })),
              }
            : undefined,
        },
        select: { id: true, reference: true },
      });

      await this.audit.recordInTransaction(tx, {
        userId: actor.id,
        action: AuditAction.CREATE,
        entity: 'Property',
        entityId: created.id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { reference: created.reference, name: dto.name },
      });

      return created;
    });

    return this.findOne(actor, property.id);
  }

  async update(
    id: string,
    dto: UpdatePropertyDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    const current = await this.repository.findOneInScope(actor, id);
    if (!current) throw this.notFound();

    const locationId = dto.locationId ?? current.location.id;
    const siteId =
      dto.siteId === null ? undefined : dto.siteId ?? current.site?.id ?? undefined;

    if (dto.locationId !== undefined || dto.siteId !== undefined) {
      await this.assertGeographyIsConsistent(locationId, siteId);
    }

    // La superficie normalisée doit être recalculée dès que la valeur *ou*
    // l'unité change, sinon les filtres et totaux deviennent faux.
    const area = dto.area ?? Number(current.area);
    const areaUnit = dto.areaUnit ?? current.areaUnit;
    const recomputeArea = dto.area !== undefined || dto.areaUnit !== undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.property.update({
        where: { id },
        data: {
          name: dto.name,
          locationId: dto.locationId,
          siteId: dto.siteId === null ? null : dto.siteId,
          area: dto.area,
          areaUnit: dto.areaUnit,
          areaSqm: recomputeArea ? toSquareMeters(area, areaUnit) : undefined,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
          sellerName: dto.sellerName,
          sellerContact: dto.sellerContact,
          status: dto.status,
          description: dto.description,
          notes: dto.notes,
          googleMapsUrl: dto.googleMapsUrl,
          googleEarthUrl: dto.googleEarthUrl,
          updatedById: actor.id,
        },
      });

      await this.audit.recordInTransaction(tx, {
        userId: actor.id,
        action: AuditAction.UPDATE,
        entity: 'Property',
        entityId: id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { changes: Object.keys(dto) },
      });
    });

    return this.findOne(actor, id);
  }

  /** Soft delete (§30) : la fiche reste consultable dans l'audit. */
  async remove(
    id: string,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<void> {
    const property = await this.prisma.property.findFirst({
      where: { AND: [this.scope.propertyFilter(actor), { id }] },
      select: {
        id: true,
        reference: true,
        _count: {
          select: {
            projects: { where: { deletedAt: null } },
            shares: { where: { status: { in: ['PENDING', 'ACTIVE'] } } },
          },
        },
      },
    });

    if (!property) throw this.notFound();

    if (property._count.projects > 0) {
      throw new ConflictException({
        message: `Suppression impossible : ${property._count.projects} projet(s) sont rattachés à ce terrain.`,
        error: 'CONFLICT',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.property.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: actor.id },
      });

      // Un bien supprimé ne doit plus être accessible par un partage encore
      // ouvert : les partages en cours sont révoqués dans la même transaction.
      if (property._count.shares > 0) {
        await tx.propertyShare.updateMany({
          where: { propertyId: id, status: { in: ['PENDING', 'ACTIVE'] } },
          data: { status: 'REVOKED', revokedAt: new Date(), revokedById: actor.id },
        });
      }

      await this.audit.recordInTransaction(tx, {
        userId: actor.id,
        action: AuditAction.DELETE,
        entity: 'Property',
        entityId: id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: {
          reference: property.reference,
          revokedShares: property._count.shares,
        },
      });
    });
  }

  // --- Coordonnées ----------------------------------------------------------

  async getCoordinates(user: AuthenticatedUser, id: string) {
    if (!(await this.repository.existsInScope(user, id))) throw this.notFound();

    return this.prisma.propertyCoordinate.findMany({
      where: { propertyId: id },
      orderBy: [{ isPrimary: 'desc' }, { pointOrder: 'asc' }],
      select: {
        id: true,
        label: true,
        latitude: true,
        longitude: true,
        altitude: true,
        pointOrder: true,
        isPrimary: true,
      },
    });
  }

  /**
   * Remplace l'ensemble des coordonnées d'un terrain.
   *
   * Un remplacement complet évite d'avoir à réconcilier des identifiants côté
   * client lors de l'édition d'une emprise, où les points sont souvent
   * réordonnés en bloc.
   */
  async replaceCoordinates(
    id: string,
    dto: ReplaceCoordinatesDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    if (!(await this.repository.existsInScope(actor, id))) throw this.notFound();

    this.assertSinglePrimaryCoordinate(dto.coordinates);

    await this.prisma.$transaction(async (tx) => {
      await tx.propertyCoordinate.deleteMany({ where: { propertyId: id } });

      if (dto.coordinates.length > 0) {
        await tx.propertyCoordinate.createMany({
          data: this.toCoordinateRows(dto.coordinates).map((row) => ({
            ...row,
            propertyId: id,
          })),
        });
      }

      await tx.property.update({
        where: { id },
        data: { updatedById: actor.id },
      });

      await this.audit.recordInTransaction(tx, {
        userId: actor.id,
        action: AuditAction.UPDATE,
        entity: 'PropertyCoordinate',
        entityId: id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { count: dto.coordinates.length },
      });
    });

    return this.getCoordinates(actor, id);
  }

  // --- Gestionnaires --------------------------------------------------------

  async getManagers(user: AuthenticatedUser, id: string) {
    if (!(await this.repository.existsInScope(user, id))) throw this.notFound();

    return this.prisma.propertyManager.findMany({
      where: { propertyId: id },
      select: {
        assignedAt: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  /** Remplace la liste des gestionnaires responsables du bien. */
  async setManagers(
    id: string,
    dto: AssignManagersDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    if (!(await this.repository.existsInScope(actor, id))) throw this.notFound();

    await this.assertManagersExist(dto.managerIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.propertyManager.deleteMany({ where: { propertyId: id } });

      if (dto.managerIds.length > 0) {
        await tx.propertyManager.createMany({
          data: dto.managerIds.map((userId) => ({
            propertyId: id,
            userId,
            assignedById: actor.id,
          })),
        });
      }

      await this.audit.recordInTransaction(tx, {
        userId: actor.id,
        action: AuditAction.UPDATE,
        entity: 'PropertyManager',
        entityId: id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { managerIds: dto.managerIds },
      });
    });

    return this.getManagers(actor, id);
  }

  /** Historique d'audit d'un terrain (§26). */
  async getHistory(user: AuthenticatedUser, id: string) {
    if (!(await this.repository.existsInScope(user, id))) throw this.notFound();

    return this.prisma.auditLog.findMany({
      where: {
        entityId: id,
        entity: { in: ['Property', 'PropertyCoordinate', 'PropertyManager'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        action: true,
        entity: true,
        metadata: true,
        createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  // --- Règles internes ------------------------------------------------------

  private toCoordinateRows(coordinates: CoordinateDto[]) {
    // Si aucun point n'est marqué principal, le premier le devient : la carte
    // générale a besoin d'un point d'ancrage par terrain.
    const hasPrimary = coordinates.some((point) => point.isPrimary);

    return coordinates.map((point, index) => ({
      label: point.label,
      latitude: new Prisma.Decimal(point.latitude),
      longitude: new Prisma.Decimal(point.longitude),
      altitude:
        point.altitude === undefined ? null : new Prisma.Decimal(point.altitude),
      pointOrder: point.pointOrder ?? index,
      isPrimary: hasPrimary ? Boolean(point.isPrimary) : index === 0,
    }));
  }

  private assertSinglePrimaryCoordinate(coordinates?: CoordinateDto[]): void {
    if (!coordinates) return;

    const primaries = coordinates.filter((point) => point.isPrimary).length;

    if (primaries > 1) {
      throw new BadRequestException({
        message: 'Un seul point principal est autorisé par terrain.',
        error: 'VALIDATION_ERROR',
        details: [
          { field: 'coordinates', message: `${primaries} points principaux fournis` },
        ],
      });
    }
  }

  /**
   * Vérifie que le site appartient bien à la ville indiquée : sans ce contrôle,
   * un terrain pourrait afficher une ville et un quartier incohérents.
   */
  private async assertGeographyIsConsistent(
    locationId: string,
    siteId?: string,
  ): Promise<void> {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, deletedAt: null },
      select: { id: true },
    });

    if (!location) {
      throw new BadRequestException({
        message: "La ville indiquée n'existe pas.",
        error: 'VALIDATION_ERROR',
        details: [{ field: 'locationId', message: 'Localité introuvable' }],
      });
    }

    if (!siteId) return;

    const site = await this.prisma.site.findFirst({
      where: { id: siteId, deletedAt: null },
      select: { id: true, locationId: true },
    });

    if (!site) {
      throw new BadRequestException({
        message: "Le site indiqué n'existe pas.",
        error: 'VALIDATION_ERROR',
        details: [{ field: 'siteId', message: 'Site introuvable' }],
      });
    }

    if (site.locationId !== locationId) {
      throw new BadRequestException({
        message: "Ce site n'appartient pas à la ville sélectionnée.",
        error: 'VALIDATION_ERROR',
        details: [{ field: 'siteId', message: 'Site incohérent avec la ville' }],
      });
    }
  }

  /**
   * Seuls des comptes actifs portant le rôle GESTIONNAIRE peuvent être
   * responsables d'un bien : affecter un utilisateur partagé lui donnerait un
   * accès qu'il ne doit pas avoir.
   */
  private async assertManagersExist(managerIds: string[]): Promise<void> {
    const unique = [...new Set(managerIds)];
    if (unique.length === 0) return;

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: unique },
        deletedAt: null,
        isActive: true,
        roles: { some: { role: { code: { in: [ROLES.GESTIONNAIRE, ROLES.ADMIN] } } } },
      },
      select: { id: true },
    });

    if (users.length !== unique.length) {
      const found = new Set(users.map((user) => user.id));
      const missing = unique.filter((id) => !found.has(id));

      throw new BadRequestException({
        message:
          'Un ou plusieurs gestionnaires sont introuvables, inactifs ou ne portent pas le rôle requis.',
        error: 'VALIDATION_ERROR',
        details: missing.map((id) => ({
          field: 'managerIds',
          message: `Gestionnaire invalide : ${id}`,
        })),
      });
    }
  }

  private notFound(): NotFoundException {
    // On ne distingue pas « inexistant » de « hors périmètre » : révéler la
    // différence permettrait d'énumérer le patrimoine.
    return new NotFoundException({
      message: "Ce terrain n'existe pas ou ne vous est pas accessible.",
      error: 'NOT_FOUND',
    });
  }
}

export { PROPERTY_DETAIL_SELECT };
