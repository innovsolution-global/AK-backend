import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditAction,
  GeoExtractionStatus,
  GeoFileFormat,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  FileValidationService,
  type UploadedFile,
} from '../uploads/file-validation.service';
import { ScopeService } from '../common/services/scope.service';
import { ROLES } from '../common/constants/rbac.constants';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import { KmlParserService } from './kml-parser.service';

/** `storageKey` reste interne (§12 : ne jamais exposer les chemins physiques). */
const GEO_FILE_SELECT = {
  id: true,
  propertyId: true,
  fileName: true,
  format: true,
  mimeType: true,
  size: true,
  featureCount: true,
  bounds: true,
  extractionStatus: true,
  extractionError: true,
  createdAt: true,
  uploadedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.PropertyGeoFileSelect;

@Injectable()
export class GoogleEarthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly validation: FileValidationService,
    private readonly parser: KmlParserService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async findAll(user: AuthenticatedUser, propertyId: string) {
    await this.assertPropertyInScope(user, propertyId);

    return this.prisma.propertyGeoFile.findMany({
      where: { propertyId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: GEO_FILE_SELECT,
    });
  }

  /** Géométrie extraite d'un fichier, pour affichage sur la carte. */
  async findGeometry(user: AuthenticatedUser, propertyId: string, fileId: string) {
    await this.assertPropertyInScope(user, propertyId);

    const file = await this.prisma.propertyGeoFile.findFirst({
      where: { id: fileId, propertyId, deletedAt: null },
      select: {
        id: true,
        fileName: true,
        extractionStatus: true,
        extractedGeometry: true,
        bounds: true,
        featureCount: true,
      },
    });

    if (!file) throw this.notFound();
    return file;
  }

  /**
   * Importe un fichier .KML ou .KMZ et l'associe au domaine (§12).
   *
   * L'extraction géographique est tentée après le stockage : un fichier
   * illisible est conservé, associé et téléchargeable, avec un statut
   * `FAILED` explicite plutôt qu'un rejet.
   */
  async upload(
    user: AuthenticatedUser,
    propertyId: string,
    file: UploadedFile | undefined,
    context: RequestContext,
  ) {
    await this.assertPropertyInScope(user, propertyId);

    const validated = this.validation.validate(file, 'geo');
    const format: GeoFileFormat =
      validated.extension === '.kmz' ? GeoFileFormat.KMZ : GeoFileFormat.KML;

    const storageKey = this.storage.buildKey(
      `properties/${propertyId}/google-earth`,
      validated.fileName,
    );

    await this.storage.upload(storageKey, validated.buffer, validated.mimeType, {
      propertyId,
      uploadedBy: user.id,
    });

    try {
      const parsed = await this.parser.parse(validated.buffer, format);

      const created = await this.prisma.$transaction(async (tx) => {
        const geoFile = await tx.propertyGeoFile.create({
          data: {
            propertyId,
            fileName: validated.fileName,
            format,
            mimeType: validated.mimeType,
            size: BigInt(validated.size),
            storageKey,
            checksum: validated.checksum,
            featureCount: parsed.featureCount,
            // `GeoBounds` est une interface sans index signature : Prisma exige
            // un type JSON structurel, d'où la conversion explicite.
            bounds: parsed.bounds
              ? (parsed.bounds as unknown as Prisma.InputJsonValue)
              : Prisma.DbNull,
            extractedGeometry: parsed.geojson
              ? (parsed.geojson as unknown as Prisma.InputJsonValue)
              : Prisma.DbNull,
            extractionStatus: GeoExtractionStatus[parsed.status],
            extractionError: parsed.error,
            uploadedById: user.id,
          },
          select: GEO_FILE_SELECT,
        });

        await this.audit.recordInTransaction(tx, {
          userId: user.id,
          action: AuditAction.UPLOAD,
          entity: 'PropertyGeoFile',
          entityId: geoFile.id,
          ip: context.ip,
          userAgent: context.userAgent,
          metadata: {
            propertyId,
            fileName: validated.fileName,
            format,
            extractionStatus: parsed.status,
            featureCount: parsed.featureCount,
          },
        });

        return geoFile;
      });

      return created;
    } catch (error) {
      await this.storage.deleteQuietly(storageKey);
      throw error;
    }
  }

  /** URL signée permettant d'ouvrir le fichier dans Google Earth. */
  async getDownloadUrl(
    user: AuthenticatedUser,
    propertyId: string,
    fileId: string,
    context: RequestContext,
  ) {
    await this.assertPropertyInScope(user, propertyId);
    await this.assertSharedAccessAllowed(user, propertyId);

    const file = await this.prisma.propertyGeoFile.findFirst({
      where: { id: fileId, propertyId, deletedAt: null },
      select: { storageKey: true, fileName: true, mimeType: true },
    });

    if (!file) throw this.notFound();

    const signed = await this.storage.getSignedDownloadUrl(
      file.storageKey,
      file.fileName,
    );

    await this.audit.record({
      userId: user.id,
      action: AuditAction.DOWNLOAD,
      entity: 'PropertyGeoFile',
      entityId: fileId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { propertyId },
    });

    return {
      url: signed.url,
      expiresIn: signed.expiresIn,
      fileName: file.fileName,
      mimeType: file.mimeType,
    };
  }

  async remove(
    user: AuthenticatedUser,
    propertyId: string,
    fileId: string,
    context: RequestContext,
  ): Promise<void> {
    await this.assertPropertyInScope(user, propertyId);

    const file = await this.prisma.propertyGeoFile.findFirst({
      where: { id: fileId, propertyId, deletedAt: null },
      select: { id: true, fileName: true },
    });

    if (!file) throw this.notFound();

    await this.prisma.propertyGeoFile.update({
      where: { id: fileId },
      data: { deletedAt: new Date(), deletedById: user.id },
    });

    await this.audit.record({
      userId: user.id,
      action: AuditAction.DELETE,
      entity: 'PropertyGeoFile',
      entityId: fileId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { propertyId, fileName: file.fileName },
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

  /** Le partage doit explicitement autoriser Google Earth (§22). */
  private async assertSharedAccessAllowed(
    user: AuthenticatedUser,
    propertyId: string,
  ): Promise<void> {
    if (!user.roles.includes(ROLES.UTILISATEUR_PARTAGE)) return;

    const allowed = await this.prisma.propertyShare.count({
      where: {
        propertyId,
        userId: user.id,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
        allowGoogleEarth: true,
      },
    });

    if (allowed === 0) throw this.notFound();
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      message: "Ce fichier n'existe pas ou ne vous est pas accessible.",
      error: 'NOT_FOUND',
    });
  }
}
