import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma, ProjectStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResult } from '../common/dto/paginated-result';
import { ReferenceService } from '../common/services/reference.service';
import { ScopeService } from '../common/services/scope.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type {
  ChangeProjectStatusDto,
  CreateComponentDto,
  CreateProjectDto,
  QueryProjectsDto,
  UpdateComponentDto,
  UpdateProjectDto,
} from './dto/project.dto';

const PROJECT_LIST_SELECT = {
  id: true,
  reference: true,
  name: true,
  status: true,
  startDate: true,
  expectedEndDate: true,
  actualEndDate: true,
  createdAt: true,
  updatedAt: true,
  location: { select: { id: true, name: true, code: true } },
  site: { select: { id: true, name: true, code: true } },
  property: { select: { id: true, reference: true, name: true } },
  company: { select: { id: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
  _count: {
    select: {
      components: { where: { deletedAt: null } },
      documents: { where: { deletedAt: null, isCurrentVersion: true } },
      permits: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.ProjectSelect;

const PROJECT_DETAIL_SELECT = {
  ...PROJECT_LIST_SELECT,
  description: true,
  notes: true,
  components: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      type: true,
      description: true,
      area: true,
      areaUnit: true,
      status: true,
      notes: true,
    },
  },
  permits: {
    where: { deletedAt: null },
    orderBy: { issueDate: 'desc' },
    select: {
      id: true,
      number: true,
      issueDate: true,
      expiryDate: true,
      authority: true,
      status: true,
      notes: true,
    },
  },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.ProjectSelect;

const SORTABLE = [
  'reference',
  'name',
  'status',
  'startDate',
  'expectedEndDate',
  'createdAt',
] as const;

/**
 * Transitions autorisées entre statuts (§18).
 *
 * Un graphe explicite évite les sauts incohérents (par exemple `IDEE` →
 * `TERMINE`) tout en laissant les chemins réels possibles : `SUSPENDU` peut
 * revenir à l'étape d'où il vient, et `ABANDONNE` est terminal.
 */
const ALLOWED_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  IDEE: ['ETUDE_PRELIMINAIRE', 'EN_ETUDE', 'ABANDONNE'],
  ETUDE_PRELIMINAIRE: ['EN_ETUDE', 'CONCEPTION', 'SUSPENDU', 'ABANDONNE'],
  EN_ETUDE: ['CONCEPTION', 'EN_ATTENTE_PERMIS', 'SUSPENDU', 'ABANDONNE'],
  CONCEPTION: ['EN_ATTENTE_PERMIS', 'SUSPENDU', 'ABANDONNE'],
  EN_ATTENTE_PERMIS: ['PERMIS_OBTENU', 'SUSPENDU', 'ABANDONNE'],
  PERMIS_OBTENU: ['TRAVAUX_PREPARATION', 'SUSPENDU', 'ABANDONNE'],
  TRAVAUX_PREPARATION: ['TRAVAUX_EN_COURS', 'SUSPENDU', 'ABANDONNE'],
  TRAVAUX_EN_COURS: ['TERMINE', 'SUSPENDU', 'ABANDONNE'],
  SUSPENDU: [
    'ETUDE_PRELIMINAIRE',
    'EN_ETUDE',
    'CONCEPTION',
    'EN_ATTENTE_PERMIS',
    'PERMIS_OBTENU',
    'TRAVAUX_PREPARATION',
    'TRAVAUX_EN_COURS',
    'ABANDONNE',
  ],
  TERMINE: [],
  ABANDONNE: [],
};

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async findAll(user: AuthenticatedUser, query: QueryProjectsDto) {
    const filters: Prisma.ProjectWhereInput = {};

    if (query.status) filters.status = query.status;
    if (query.propertyId) filters.propertyId = query.propertyId;
    if (query.companyId) filters.companyId = query.companyId;
    if (query.locationId) filters.locationId = query.locationId;
    if (query.siteId) filters.siteId = query.siteId;
    if (query.managerId) filters.managerId = query.managerId;

    if (query.search) {
      filters.OR = [
        { reference: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const where: Prisma.ProjectWhereInput = {
      AND: [this.scope.projectFilter(user), filters],
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        select: PROJECT_LIST_SELECT,
        orderBy: query.buildOrderBy(SORTABLE, 'createdAt'),
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.project.count({ where }),
    ]);

    return PaginatedResult.from(items, total, query);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { AND: [this.scope.projectFilter(user), { id }] },
      select: PROJECT_DETAIL_SELECT,
    });

    if (!project) throw this.notFound();
    return project;
  }

  async create(
    dto: CreateProjectDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    await this.assertReferencesAreValid(dto.locationId, dto.siteId, dto.propertyId);

    const status = dto.status ?? ProjectStatus.IDEE;

    const project = await this.prisma.$transaction(async (tx) => {
      const reference = await this.references.nextProjectReference(tx);

      const created = await tx.project.create({
        data: {
          reference,
          name: dto.name,
          locationId: dto.locationId,
          siteId: dto.siteId,
          propertyId: dto.propertyId,
          companyId: dto.companyId,
          managerId: dto.managerId,
          description: dto.description,
          status,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          expectedEndDate: dto.expectedEndDate
            ? new Date(dto.expectedEndDate)
            : null,
          notes: dto.notes,
          createdById: actor.id,
          updatedById: actor.id,
          // L'historique démarre dès la création : aucun projet n'existe sans
          // trace de son statut initial (§18).
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: status,
              comment: 'Création du projet',
              changedById: actor.id,
            },
          },
        },
        select: { id: true, reference: true },
      });

      await this.audit.recordInTransaction(tx, {
        userId: actor.id,
        action: AuditAction.CREATE,
        entity: 'Project',
        entityId: created.id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { reference: created.reference, name: dto.name, status },
      });

      return created;
    });

    return this.findOne(actor, project.id);
  }

  async update(
    id: string,
    dto: UpdateProjectDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    const current = await this.findOne(actor, id);

    if (
      dto.locationId !== undefined ||
      dto.siteId !== undefined ||
      dto.propertyId !== undefined
    ) {
      await this.assertReferencesAreValid(
        dto.locationId ?? current.location.id,
        dto.siteId === null ? undefined : dto.siteId ?? current.site?.id,
        dto.propertyId === null ? undefined : dto.propertyId ?? current.property?.id,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: {
          name: dto.name,
          locationId: dto.locationId,
          siteId: dto.siteId === null ? null : dto.siteId,
          propertyId: dto.propertyId === null ? null : dto.propertyId,
          companyId: dto.companyId === null ? null : dto.companyId,
          managerId: dto.managerId === null ? null : dto.managerId,
          description: dto.description,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          expectedEndDate: dto.expectedEndDate
            ? new Date(dto.expectedEndDate)
            : undefined,
          actualEndDate: dto.actualEndDate ? new Date(dto.actualEndDate) : undefined,
          notes: dto.notes,
          updatedById: actor.id,
        },
      });

      await this.audit.recordInTransaction(tx, {
        userId: actor.id,
        action: AuditAction.UPDATE,
        entity: 'Project',
        entityId: id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { changes: Object.keys(dto) },
      });
    });

    return this.findOne(actor, id);
  }

  /**
   * Fait évoluer le statut (§18).
   *
   * Le changement et l'écriture de l'historique se font dans **une seule
   * transaction** : un statut ne peut jamais avancer sans laisser de trace.
   */
  async changeStatus(
    id: string,
    dto: ChangeProjectStatusDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    const project = await this.findOne(actor, id);

    if (project.status === dto.status) {
      throw new BadRequestException({
        message: 'Le projet est déjà dans ce statut.',
        error: 'VALIDATION_ERROR',
        details: [{ field: 'status', message: 'Statut inchangé' }],
      });
    }

    const allowed = ALLOWED_TRANSITIONS[project.status];

    if (!allowed.includes(dto.status)) {
      throw new BadRequestException({
        message: `Transition non autorisée : ${project.status} → ${dto.status}.`,
        error: 'VALIDATION_ERROR',
        details: [
          {
            field: 'status',
            message:
              allowed.length > 0
                ? `Transitions possibles : ${allowed.join(', ')}`
                : 'Ce statut est terminal',
          },
        ],
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: {
          status: dto.status,
          updatedById: actor.id,
          // Un projet terminé porte sa date de fin réelle si elle n'a pas été
          // saisie manuellement.
          actualEndDate:
            dto.status === ProjectStatus.TERMINE && !project.actualEndDate
              ? new Date()
              : undefined,
        },
      });

      await tx.projectStatusHistory.create({
        data: {
          projectId: id,
          fromStatus: project.status,
          toStatus: dto.status,
          comment: dto.comment,
          changedById: actor.id,
        },
      });

      await this.audit.recordInTransaction(tx, {
        userId: actor.id,
        action: AuditAction.UPDATE,
        entity: 'Project',
        entityId: id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { from: project.status, to: dto.status, comment: dto.comment },
      });
    });

    return this.findOne(actor, id);
  }

  /** Historique complet, jamais modifiable (§18). */
  async getStatusHistory(user: AuthenticatedUser, id: string) {
    await this.findOne(user, id);

    return this.prisma.projectStatusHistory.findMany({
      where: { projectId: id },
      orderBy: { changedAt: 'desc' },
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        comment: true,
        changedAt: true,
        changedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async remove(
    id: string,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<void> {
    const project = await this.findOne(actor, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: actor.id },
      });

      await this.audit.recordInTransaction(tx, {
        userId: actor.id,
        action: AuditAction.DELETE,
        entity: 'Project',
        entityId: id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { reference: project.reference },
      });
    });
  }

  // --- Composantes ----------------------------------------------------------

  async addComponent(
    projectId: string,
    dto: CreateComponentDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    await this.findOne(actor, projectId);

    const component = await this.prisma.projectComponent.create({
      data: { projectId, ...dto },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        area: true,
        areaUnit: true,
        status: true,
        notes: true,
      },
    });

    await this.audit.record({
      userId: actor.id,
      action: AuditAction.CREATE,
      entity: 'ProjectComponent',
      entityId: component.id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { projectId, name: dto.name, type: dto.type },
    });

    return component;
  }

  async updateComponent(
    projectId: string,
    componentId: string,
    dto: UpdateComponentDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    await this.findOne(actor, projectId);
    await this.assertComponentBelongsToProject(projectId, componentId);

    const component = await this.prisma.projectComponent.update({
      where: { id: componentId },
      data: { ...dto },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        area: true,
        areaUnit: true,
        status: true,
        notes: true,
      },
    });

    await this.audit.record({
      userId: actor.id,
      action: AuditAction.UPDATE,
      entity: 'ProjectComponent',
      entityId: componentId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { projectId },
    });

    return component;
  }

  async removeComponent(
    projectId: string,
    componentId: string,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<void> {
    await this.findOne(actor, projectId);
    await this.assertComponentBelongsToProject(projectId, componentId);

    await this.prisma.projectComponent.update({
      where: { id: componentId },
      data: { deletedAt: new Date(), deletedById: actor.id },
    });

    await this.audit.record({
      userId: actor.id,
      action: AuditAction.DELETE,
      entity: 'ProjectComponent',
      entityId: componentId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { projectId },
    });
  }

  // --- Règles internes ------------------------------------------------------

  private async assertComponentBelongsToProject(
    projectId: string,
    componentId: string,
  ): Promise<void> {
    const count = await this.prisma.projectComponent.count({
      where: { id: componentId, projectId, deletedAt: null },
    });

    if (count === 0) {
      throw new NotFoundException({
        message: "Cette composante n'existe pas pour ce projet.",
        error: 'NOT_FOUND',
      });
    }
  }

  /**
   * Vérifie la cohérence géographique du projet : le site doit appartenir à la
   * ville, et le terrain associé doit se trouver dans la même ville.
   */
  private async assertReferencesAreValid(
    locationId: string,
    siteId?: string,
    propertyId?: string,
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

    if (siteId) {
      const site = await this.prisma.site.findFirst({
        where: { id: siteId, deletedAt: null },
        select: { locationId: true },
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

    if (propertyId) {
      const property = await this.prisma.property.findFirst({
        where: { id: propertyId, deletedAt: null },
        select: { locationId: true },
      });

      if (!property) {
        throw new BadRequestException({
          message: "Le domaine associé n'existe pas.",
          error: 'VALIDATION_ERROR',
          details: [{ field: 'propertyId', message: 'Terrain introuvable' }],
        });
      }

      if (property.locationId !== locationId) {
        throw new BadRequestException({
          message: "Le domaine associé n'est pas situé dans la ville sélectionnée.",
          error: 'VALIDATION_ERROR',
          details: [
            { field: 'propertyId', message: 'Terrain incohérent avec la ville' },
          ],
        });
      }
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      message: "Ce projet n'existe pas ou ne vous est pas accessible.",
      error: 'NOT_FOUND',
    });
  }
}

export { ALLOWED_TRANSITIONS };
