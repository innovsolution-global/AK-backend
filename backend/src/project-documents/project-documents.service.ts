import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  FileValidationService,
  type UploadedFile,
} from '../uploads/file-validation.service';
import { PaginatedResult } from '../common/dto/paginated-result';
import { ScopeService } from '../common/services/scope.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type {
  QueryProjectDocumentsDto,
  UploadProjectDocumentDto,
} from './dto/project-document.dto';

/** `storageKey` reste interne (§25). */
const PROJECT_DOCUMENT_SELECT = {
  id: true,
  projectId: true,
  componentId: true,
  name: true,
  type: true,
  fileName: true,
  mimeType: true,
  size: true,
  version: true,
  parentDocumentId: true,
  isCurrentVersion: true,
  checksum: true,
  createdAt: true,
  uploadedBy: { select: { id: true, firstName: true, lastName: true } },
  component: { select: { id: true, name: true } },
} satisfies Prisma.ProjectDocumentSelect;

const SORTABLE = ['createdAt', 'name', 'type', 'size', 'version'] as const;

@Injectable()
export class ProjectDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly validation: FileValidationService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async findAll(
    user: AuthenticatedUser,
    projectId: string,
    query: QueryProjectDocumentsDto,
  ) {
    await this.assertProjectInScope(user, projectId);

    const where: Prisma.ProjectDocumentWhereInput = {
      projectId,
      deletedAt: null,
      ...(query.includeVersions ? {} : { isCurrentVersion: true }),
      ...(query.type ? { type: query.type } : {}),
      ...(query.componentId ? { componentId: query.componentId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { fileName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.projectDocument.findMany({
        where,
        select: PROJECT_DOCUMENT_SELECT,
        orderBy: query.buildOrderBy(SORTABLE, 'createdAt'),
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.projectDocument.count({ where }),
    ]);

    return PaginatedResult.from(items, total, query);
  }

  async upload(
    user: AuthenticatedUser,
    projectId: string,
    dto: UploadProjectDocumentDto,
    file: UploadedFile | undefined,
    context: RequestContext,
  ) {
    await this.assertProjectInScope(user, projectId);

    if (dto.componentId) {
      await this.assertComponentBelongsToProject(projectId, dto.componentId);
    }

    const validated = this.validation.validate(file, 'document');
    const storageKey = this.storage.buildKey(
      `projects/${projectId}/documents`,
      validated.fileName,
    );

    await this.storage.upload(storageKey, validated.buffer, validated.mimeType, {
      projectId,
      uploadedBy: user.id,
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.projectDocument.create({
          data: {
            projectId,
            componentId: dto.componentId,
            name: dto.name,
            type: dto.type,
            fileName: validated.fileName,
            mimeType: validated.mimeType,
            size: BigInt(validated.size),
            storageKey,
            checksum: validated.checksum,
            version: 1,
            isCurrentVersion: true,
            uploadedById: user.id,
          },
          select: PROJECT_DOCUMENT_SELECT,
        });

        await this.audit.recordInTransaction(tx, {
          userId: user.id,
          action: AuditAction.UPLOAD,
          entity: 'ProjectDocument',
          entityId: created.id,
          ip: context.ip,
          userAgent: context.userAgent,
          metadata: { projectId, fileName: validated.fileName, type: dto.type },
        });

        return created;
      });
    } catch (error) {
      // L'objet est déjà écrit : on le retire pour ne pas laisser de fichier
      // orphelin dans le bucket.
      await this.storage.deleteQuietly(storageKey);
      throw error;
    }
  }

  async getDownloadUrl(
    user: AuthenticatedUser,
    documentId: string,
    inline: boolean,
    context: RequestContext,
  ) {
    const document = await this.prisma.projectDocument.findFirst({
      where: {
        id: documentId,
        deletedAt: null,
        project: this.scope.projectFilter(user),
      },
      select: {
        id: true,
        projectId: true,
        storageKey: true,
        fileName: true,
        mimeType: true,
      },
    });

    if (!document) throw this.notFound();

    const signed = await this.storage.getSignedDownloadUrl(
      document.storageKey,
      document.fileName,
      inline,
    );

    await this.audit.record({
      userId: user.id,
      action: AuditAction.DOWNLOAD,
      entity: 'ProjectDocument',
      entityId: documentId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { projectId: document.projectId, inline },
    });

    return {
      url: signed.url,
      expiresIn: signed.expiresIn,
      fileName: document.fileName,
      mimeType: document.mimeType,
    };
  }

  async remove(
    user: AuthenticatedUser,
    documentId: string,
    context: RequestContext,
  ): Promise<void> {
    const document = await this.prisma.projectDocument.findFirst({
      where: {
        id: documentId,
        deletedAt: null,
        project: this.scope.projectFilter(user),
      },
      select: { id: true, projectId: true, name: true },
    });

    if (!document) throw this.notFound();

    await this.prisma.projectDocument.update({
      where: { id: documentId },
      data: { deletedAt: new Date(), deletedById: user.id },
    });

    await this.audit.record({
      userId: user.id,
      action: AuditAction.DELETE,
      entity: 'ProjectDocument',
      entityId: documentId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { projectId: document.projectId, name: document.name },
    });
  }

  // --- Règles internes ------------------------------------------------------

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

  private async assertComponentBelongsToProject(
    projectId: string,
    componentId: string,
  ): Promise<void> {
    const count = await this.prisma.projectComponent.count({
      where: { id: componentId, projectId, deletedAt: null },
    });

    if (count === 0) {
      throw new BadRequestException({
        message: "Cette composante n'appartient pas à ce projet.",
        error: 'VALIDATION_ERROR',
        details: [{ field: 'componentId', message: 'Composante introuvable' }],
      });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      message: "Ce document n'existe pas ou ne vous est pas accessible.",
      error: 'NOT_FOUND',
    });
  }
}
