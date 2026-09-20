import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import { ROLES } from '../common/constants/rbac.constants';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type {
  QueryPropertyDocumentsDto,
  UploadDocumentVersionDto,
  UploadPropertyDocumentDto,
} from './dto/property-document.dto';

/**
 * Projection publique d'un document.
 * `storageKey` en est volontairement absent : la clé physique ne doit jamais
 * sortir de l'API (§12, §25).
 */
const DOCUMENT_SELECT = {
  id: true,
  propertyId: true,
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
  updatedAt: true,
  uploadedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.PropertyDocumentSelect;

const SORTABLE = ['createdAt', 'name', 'type', 'size', 'version'] as const;

@Injectable()
export class PropertyDocumentsService {
  private readonly logger = new Logger(PropertyDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly validation: FileValidationService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async findAll(
    user: AuthenticatedUser,
    propertyId: string,
    query: QueryPropertyDocumentsDto,
  ) {
    await this.assertPropertyInScope(user, propertyId);

    const where: Prisma.PropertyDocumentWhereInput = {
      propertyId,
      deletedAt: null,
      // Par défaut on ne montre que la version courante : l'historique est
      // consultable document par document.
      ...(query.includeVersions ? {} : { isCurrentVersion: true }),
      ...(query.type ? { type: query.type } : {}),
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
      this.prisma.propertyDocument.findMany({
        where,
        select: DOCUMENT_SELECT,
        orderBy: query.buildOrderBy(SORTABLE, 'createdAt'),
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.propertyDocument.count({ where }),
    ]);

    return PaginatedResult.from(items, total, query);
  }

  async findOne(user: AuthenticatedUser, documentId: string) {
    const document = await this.prisma.propertyDocument.findFirst({
      where: {
        id: documentId,
        deletedAt: null,
        property: this.scope.propertyFilter(user),
      },
      select: DOCUMENT_SELECT,
    });

    if (!document) throw this.notFound();

    // Un bénéficiaire de partage ne voit que les documents explicitement
    // inscrits sur sa liste blanche (§22).
    await this.assertSharedAccessAllowed(user, documentId);

    return document;
  }

  /** Toutes les versions d'un document, de la plus récente à la plus ancienne. */
  async findVersions(user: AuthenticatedUser, documentId: string) {
    const document = await this.findOne(user, documentId);
    const rootId = document.parentDocumentId ?? document.id;

    return this.prisma.propertyDocument.findMany({
      where: {
        deletedAt: null,
        OR: [{ id: rootId }, { parentDocumentId: rootId }],
      },
      select: DOCUMENT_SELECT,
      orderBy: { version: 'desc' },
    });
  }

  /**
   * Téléverse un document.
   *
   * Le fichier est validé puis écrit dans le stockage objet **avant** la
   * transaction : si l'écriture en base échoue ensuite, l'objet orphelin est
   * supprimé. L'inverse — écrire en base puis téléverser — laisserait une
   * métadonnée pointant vers un fichier inexistant.
   */
  async upload(
    user: AuthenticatedUser,
    propertyId: string,
    dto: UploadPropertyDocumentDto,
    file: UploadedFile | undefined,
    context: RequestContext,
  ) {
    await this.assertPropertyInScope(user, propertyId);

    const validated = this.validation.validate(file, 'document');
    const storageKey = this.storage.buildKey(
      `properties/${propertyId}/documents`,
      validated.fileName,
    );

    await this.storage.upload(storageKey, validated.buffer, validated.mimeType, {
      propertyId,
      uploadedBy: user.id,
    });

    try {
      const document = await this.prisma.$transaction(async (tx) => {
        const created = await tx.propertyDocument.create({
          data: {
            propertyId,
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
          select: DOCUMENT_SELECT,
        });

        await this.audit.recordInTransaction(tx, {
          userId: user.id,
          action: AuditAction.UPLOAD,
          entity: 'PropertyDocument',
          entityId: created.id,
          ip: context.ip,
          userAgent: context.userAgent,
          metadata: {
            propertyId,
            fileName: validated.fileName,
            size: validated.size,
            type: dto.type,
          },
        });

        return created;
      });

      return document;
    } catch (error) {
      await this.storage.deleteQuietly(storageKey);
      throw error;
    }
  }

  /**
   * Ajoute une nouvelle version (§13).
   *
   * Aucun fichier n'est écrasé : une ligne est créée avec `version = max + 1`,
   * et la version précédente perd son drapeau `isCurrentVersion`.
   */
  async uploadVersion(
    user: AuthenticatedUser,
    documentId: string,
    dto: UploadDocumentVersionDto,
    file: UploadedFile | undefined,
    context: RequestContext,
  ) {
    const current = await this.findOne(user, documentId);
    const rootId = current.parentDocumentId ?? current.id;

    const validated = this.validation.validate(file, 'document');
    const storageKey = this.storage.buildKey(
      `properties/${current.propertyId}/documents`,
      validated.fileName,
    );

    await this.storage.upload(storageKey, validated.buffer, validated.mimeType, {
      propertyId: current.propertyId,
      uploadedBy: user.id,
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const latest = await tx.propertyDocument.aggregate({
          where: { OR: [{ id: rootId }, { parentDocumentId: rootId }] },
          _max: { version: true },
        });

        await tx.propertyDocument.updateMany({
          where: {
            OR: [{ id: rootId }, { parentDocumentId: rootId }],
            isCurrentVersion: true,
          },
          data: { isCurrentVersion: false },
        });

        const created = await tx.propertyDocument.create({
          data: {
            propertyId: current.propertyId,
            name: dto.name ?? current.name,
            type: current.type,
            fileName: validated.fileName,
            mimeType: validated.mimeType,
            size: BigInt(validated.size),
            storageKey,
            checksum: validated.checksum,
            version: (latest._max.version ?? 1) + 1,
            parentDocumentId: rootId,
            isCurrentVersion: true,
            uploadedById: user.id,
          },
          select: DOCUMENT_SELECT,
        });

        await this.audit.recordInTransaction(tx, {
          userId: user.id,
          action: AuditAction.UPLOAD,
          entity: 'PropertyDocument',
          entityId: created.id,
          ip: context.ip,
          userAgent: context.userAgent,
          metadata: { rootDocumentId: rootId, version: created.version },
        });

        return created;
      });
    } catch (error) {
      await this.storage.deleteQuietly(storageKey);
      throw error;
    }
  }

  /**
   * Produit une URL signée de téléchargement (§25).
   * Les droits sont vérifiés ici ; la clé de stockage reste interne.
   */
  async getDownloadUrl(
    user: AuthenticatedUser,
    documentId: string,
    inline: boolean,
    context: RequestContext,
  ) {
    await this.findOne(user, documentId);

    const document = await this.prisma.propertyDocument.findFirstOrThrow({
      where: { id: documentId, deletedAt: null },
      select: { storageKey: true, fileName: true, mimeType: true, propertyId: true },
    });

    const signed = await this.storage.getSignedDownloadUrl(
      document.storageKey,
      document.fileName,
      inline,
    );

    await this.audit.record({
      userId: user.id,
      action: AuditAction.DOWNLOAD,
      entity: 'PropertyDocument',
      entityId: documentId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { propertyId: document.propertyId, inline },
    });

    return {
      url: signed.url,
      expiresIn: signed.expiresIn,
      fileName: document.fileName,
      mimeType: document.mimeType,
    };
  }

  /**
   * Suppression logique.
   * L'objet reste dans le stockage : une suppression physique rendrait
   * l'historique d'audit invérifiable et empêcherait toute restauration.
   */
  async remove(
    user: AuthenticatedUser,
    documentId: string,
    context: RequestContext,
  ): Promise<void> {
    const document = await this.findOne(user, documentId);

    await this.prisma.$transaction(async (tx) => {
      await tx.propertyDocument.update({
        where: { id: documentId },
        data: { deletedAt: new Date(), deletedById: user.id },
      });

      // Si la version courante disparaît, la plus récente version restante
      // reprend ce rôle, sinon le document deviendrait invisible en liste.
      if (document.isCurrentVersion) {
        const rootId = document.parentDocumentId ?? document.id;

        const fallback = await tx.propertyDocument.findFirst({
          where: {
            deletedAt: null,
            id: { not: documentId },
            OR: [{ id: rootId }, { parentDocumentId: rootId }],
          },
          orderBy: { version: 'desc' },
          select: { id: true },
        });

        if (fallback) {
          await tx.propertyDocument.update({
            where: { id: fallback.id },
            data: { isCurrentVersion: true },
          });
        }
      }

      await this.audit.recordInTransaction(tx, {
        userId: user.id,
        action: AuditAction.DELETE,
        entity: 'PropertyDocument',
        entityId: documentId,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { propertyId: document.propertyId, name: document.name },
      });
    });
  }

  // --- Règles internes ------------------------------------------------------

  private async assertPropertyInScope(
    user: AuthenticatedUser,
    propertyId: string,
  ): Promise<void> {
    const count = await this.prisma.property.count({
      where: { AND: [this.scope.propertyFilter(user), { id: propertyId }] },
    });

    if (count === 0) {
      throw new NotFoundException({
        message: "Ce terrain n'existe pas ou ne vous est pas accessible.",
        error: 'NOT_FOUND',
      });
    }
  }

  /**
   * Pour un utilisateur partagé, l'accès au terrain ne suffit pas : le document
   * doit figurer sur la liste blanche du partage et celui-ci doit autoriser les
   * documents (§22).
   */
  private async assertSharedAccessAllowed(
    user: AuthenticatedUser,
    documentId: string,
  ): Promise<void> {
    if (!user.roles.includes(ROLES.UTILISATEUR_PARTAGE)) return;

    const allowed = await this.prisma.propertyShareDocument.count({
      where: {
        documentId,
        share: {
          userId: user.id,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
          allowDocuments: true,
        },
      },
    });

    if (allowed === 0) {
      this.logger.warn(
        `Accès refusé au document ${documentId} pour le bénéficiaire ${user.id}.`,
      );
      throw this.notFound();
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      message: "Ce document n'existe pas ou ne vous est pas accessible.",
      error: 'NOT_FOUND',
    });
  }
}

export { DOCUMENT_SELECT };
