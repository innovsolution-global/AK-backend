import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, BuildingPermitStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/services/scope.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type {
  CreateBuildingPermitDto,
  UpdateBuildingPermitDto,
} from './dto/building-permit.dto';

const PERMIT_SELECT = {
  id: true,
  projectId: true,
  number: true,
  issueDate: true,
  expiryDate: true,
  authority: true,
  status: true,
  documentId: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BuildingPermitSelect;

@Injectable()
export class BuildingPermitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async findAll(user: AuthenticatedUser, projectId: string) {
    await this.assertProjectInScope(user, projectId);

    return this.prisma.buildingPermit.findMany({
      where: { projectId, deletedAt: null },
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
      select: PERMIT_SELECT,
    });
  }

  async create(
    user: AuthenticatedUser,
    projectId: string,
    dto: CreateBuildingPermitDto,
    context: RequestContext,
  ) {
    await this.assertProjectInScope(user, projectId);
    this.assertDatesAreCoherent(dto.issueDate, dto.expiryDate);
    await this.assertDocumentBelongsToProject(projectId, dto.documentId);

    const permit = await this.prisma.buildingPermit.create({
      data: {
        projectId,
        number: dto.number,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        authority: dto.authority,
        status: dto.status ?? BuildingPermitStatus.EN_ATTENTE,
        documentId: dto.documentId,
        notes: dto.notes,
      },
      select: PERMIT_SELECT,
    });

    await this.audit.record({
      userId: user.id,
      action: AuditAction.CREATE,
      entity: 'BuildingPermit',
      entityId: permit.id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { projectId, number: dto.number, status: permit.status },
    });

    return permit;
  }

  async update(
    user: AuthenticatedUser,
    projectId: string,
    permitId: string,
    dto: UpdateBuildingPermitDto,
    context: RequestContext,
  ) {
    await this.assertProjectInScope(user, projectId);
    const current = await this.findOneOrThrow(projectId, permitId);

    this.assertDatesAreCoherent(
      dto.issueDate ?? current.issueDate?.toISOString(),
      dto.expiryDate ?? current.expiryDate?.toISOString(),
    );

    if (dto.documentId) {
      await this.assertDocumentBelongsToProject(projectId, dto.documentId);
    }

    const permit = await this.prisma.buildingPermit.update({
      where: { id: permitId },
      data: {
        number: dto.number,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        authority: dto.authority,
        status: dto.status,
        documentId: dto.documentId === null ? null : dto.documentId,
        notes: dto.notes,
      },
      select: PERMIT_SELECT,
    });

    await this.audit.record({
      userId: user.id,
      action: AuditAction.UPDATE,
      entity: 'BuildingPermit',
      entityId: permitId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { projectId, changes: Object.keys(dto) },
    });

    return permit;
  }

  async remove(
    user: AuthenticatedUser,
    projectId: string,
    permitId: string,
    context: RequestContext,
  ): Promise<void> {
    await this.assertProjectInScope(user, projectId);
    await this.findOneOrThrow(projectId, permitId);

    await this.prisma.buildingPermit.update({
      where: { id: permitId },
      data: { deletedAt: new Date(), deletedById: user.id },
    });

    await this.audit.record({
      userId: user.id,
      action: AuditAction.DELETE,
      entity: 'BuildingPermit',
      entityId: permitId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { projectId },
    });
  }

  // --- Règles internes ------------------------------------------------------

  private async findOneOrThrow(projectId: string, permitId: string) {
    const permit = await this.prisma.buildingPermit.findFirst({
      where: { id: permitId, projectId, deletedAt: null },
      select: PERMIT_SELECT,
    });

    if (!permit) {
      throw new NotFoundException({
        message: "Ce permis n'existe pas pour ce projet.",
        error: 'NOT_FOUND',
      });
    }

    return permit;
  }

  private assertDatesAreCoherent(
    issueDate?: string,
    expiryDate?: string,
  ): void {
    if (!issueDate || !expiryDate) return;

    if (new Date(expiryDate) <= new Date(issueDate)) {
      throw new BadRequestException({
        message: "La date d'expiration doit être postérieure à la date d'émission.",
        error: 'VALIDATION_ERROR',
        details: [{ field: 'expiryDate', message: 'Date incohérente' }],
      });
    }
  }

  /**
   * Un permis ne peut référencer qu'un document de **son** projet : pointer
   * vers un document d'un autre projet exposerait une pièce hors périmètre.
   */
  private async assertDocumentBelongsToProject(
    projectId: string,
    documentId?: string,
  ): Promise<void> {
    if (!documentId) return;

    const count = await this.prisma.projectDocument.count({
      where: { id: documentId, projectId, deletedAt: null },
    });

    if (count === 0) {
      throw new BadRequestException({
        message: "Le document associé n'appartient pas à ce projet.",
        error: 'VALIDATION_ERROR',
        details: [{ field: 'documentId', message: 'Document introuvable' }],
      });
    }
  }

  private async assertProjectInScope(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<void> {
    const count = await this.prisma.project.count({
      where: { AND: [this.scope.projectFilter(user), { id: projectId }] },
    });

    if (count === 0) {
      throw new NotFoundException({
        message: "Ce projet n'existe pas ou ne vous est pas accessible.",
        error: 'NOT_FOUND',
      });
    }
  }
}
