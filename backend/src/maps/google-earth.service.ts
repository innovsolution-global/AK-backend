import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, GeoExtractionStatus, GeoFileFormat, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  FileValidationService,
  type UploadedFile,
} from '../uploads/file-validation.service';
import { ScopeService } from '../common/services/scope.service';
import { ROLES } from '../common/constants/rbac.constants';
import {
  firstPolygonRing,
  pointsOf,
  ringAreaSqm,
  ringCentroid,
} from '../common/utils/geo.util';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import { PropertiesService } from '../properties/properties.service';
import { KmlParserService } from './kml-parser.service';
import { PropertyKmlService } from './property-kml.service';

/** Limite alignée sur `ReplaceCoordinatesDto` : au-delà, le KML reste la source. */
const MAX_APPLIED_VERTICES = 500;

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
    private readonly propertyKml: PropertyKmlService,
    private readonly properties: PropertiesService,
  ) {}

  /**
   * Fichier KML du terrain, généré à la demande depuis ses coordonnées et ses
   * fichiers importés (§12). C'est ce document qui s'ouvre dans Google Earth.
   */
  async exportKml(user: AuthenticatedUser, propertyId: string, context: RequestContext) {
    await this.assertPropertyInScope(user, propertyId);
    await this.assertSharedAccessAllowed(user, propertyId);

    const document = await this.propertyKml.build(propertyId);

    await this.audit.record({
      userId: user.id,
      action: AuditAction.DOWNLOAD,
      entity: 'Property',
      entityId: propertyId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { format: 'KML', vertexCount: document.vertexCount },
    });

    return document;
  }

  /**
   * Reprend l'emprise d'un fichier importé comme coordonnées du terrain.
   *
   * Le géomètre livre un KML ; plutôt que de ressaisir chaque borne, on adopte
   * son polygone : les sommets deviennent les bornes, le centroïde devient le
   * repère de la carte générale. Sans polygone, les points isolés sont repris.
   */
  async applyCoordinates(
    user: AuthenticatedUser,
    propertyId: string,
    fileId: string,
    context: RequestContext,
  ) {
    await this.assertPropertyInScope(user, propertyId);

    const file = await this.prisma.propertyGeoFile.findFirst({
      where: { id: fileId, propertyId, deletedAt: null },
      select: { fileName: true, extractedGeometry: true, extractionStatus: true },
    });

    if (!file) throw this.notFound();

    if (file.extractionStatus === GeoExtractionStatus.FAILED || !file.extractedGeometry) {
      throw new BadRequestException({
        message:
          "Aucune géométrie n'a pu être extraite de ce fichier ; ses coordonnées ne peuvent pas être reprises.",
        error: 'GEO_EXTRACTION_UNAVAILABLE',
      });
    }

    const polygon = firstPolygonRing(file.extractedGeometry);
    const isolatedPoints = polygon ? [] : pointsOf(file.extractedGeometry);

    if (!polygon && isolatedPoints.length === 0) {
      throw new BadRequestException({
        message: 'Ce fichier ne contient ni polygone ni point exploitable.',
        error: 'GEO_NO_GEOMETRY',
      });
    }

    const vertices = polygon ? polygon.points : isolatedPoints;

    if (vertices.length > MAX_APPLIED_VERTICES) {
      throw new BadRequestException({
        message: `L'emprise compte ${vertices.length} sommets ; la limite est de ${MAX_APPLIED_VERTICES}. Le fichier reste consultable dans Google Earth.`,
        error: 'GEO_TOO_MANY_VERTICES',
      });
    }

    const center = ringCentroid(vertices);

    const coordinates = [
      {
        label: polygon ? 'Centre de l’emprise' : 'Point principal',
        latitude: round9(center.latitude),
        longitude: round9(center.longitude),
        pointOrder: 0,
        isPrimary: true,
      },
      ...vertices.map((point, index) => ({
        label: point.label ?? `Borne ${index + 1}`,
        latitude: round9(point.latitude),
        longitude: round9(point.longitude),
        altitude:
          point.altitude === null || point.altitude === undefined
            ? undefined
            : Math.round(point.altitude * 100) / 100,
        pointOrder: index + 1,
        isPrimary: false,
      })),
    ];

    const saved = await this.properties.replaceCoordinates(
      propertyId,
      { coordinates },
      user,
      context,
    );

    await this.audit.record({
      userId: user.id,
      action: AuditAction.UPDATE,
      entity: 'Property',
      entityId: propertyId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: {
        source: 'GEO_FILE',
        fileId,
        fileName: file.fileName,
        vertexCount: vertices.length,
        measuredAreaSqm: polygon ? ringAreaSqm(vertices) : null,
      },
    });

    return {
      coordinates: saved,
      vertexCount: vertices.length,
      measuredAreaSqm: polygon ? ringAreaSqm(vertices) : null,
      sourceName: polygon?.name ?? null,
    };
  }

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
   *
   * **Déposer le fichier suffit à dessiner le terrain** : si le domaine n'a
   * pas encore d'emprise (au plus un repère), le polygone extrait devient
   * automatiquement ses coordonnées. Une emprise déjà saisie n'est jamais
   * écrasée sans un geste explicite (`applyCoordinates`).
   */
  async upload(
    user: AuthenticatedUser,
    propertyId: string,
    file: UploadedFile | undefined,
    context: RequestContext,
  ) {
    await this.assertPropertyInScope(user, propertyId);
    const hadOutline = await this.hasOutline(propertyId);

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

    let created: Awaited<ReturnType<typeof this.persistGeoFile>>;
    let readable = false;

    try {
      const parsed = await this.parser.parse(validated.buffer, format);
      readable = parsed.status !== 'FAILED' && parsed.geojson !== null;
      created = await this.persistGeoFile(
        { user, propertyId, storageKey, format, validated, parsed },
        context,
      );
    } catch (error) {
      await this.storage.deleteQuietly(storageKey);
      throw error;
    }

    if (!readable || hadOutline) {
      return {
        ...created,
        autoApplied: false,
        appliedVertexCount: null,
        measuredAreaSqm: null,
      };
    }

    // Reprise automatique : une géométrie inexploitable (trop de sommets,
    // points seuls…) n'empêche pas l'import, elle laisse simplement le
    // terrain tel qu'il était.
    try {
      const applied = await this.applyCoordinates(user, propertyId, created.id, context);
      return {
        ...created,
        autoApplied: true,
        appliedVertexCount: applied.vertexCount,
        measuredAreaSqm: applied.measuredAreaSqm,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        return {
          ...created,
          autoApplied: false,
          appliedVertexCount: null,
          measuredAreaSqm: null,
        };
      }
      throw error;
    }
  }

  private async persistGeoFile(
    input: {
      user: AuthenticatedUser;
      propertyId: string;
      storageKey: string;
      format: GeoFileFormat;
      validated: ReturnType<FileValidationService['validate']>;
      parsed: Awaited<ReturnType<KmlParserService['parse']>>;
    },
    context: RequestContext,
  ) {
    const { user, propertyId, storageKey, format, validated, parsed } = input;

    return this.prisma.$transaction(async (tx) => {
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

  /** Le terrain a-t-il déjà une emprise (trois bornes hors repère) ? */
  private async hasOutline(propertyId: string): Promise<boolean> {
    const bornes = await this.prisma.propertyCoordinate.count({
      where: { propertyId, isPrimary: false },
    });
    return bornes >= 3;
  }

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

    // Le partage le plus récent fait foi : une autorisation retirée lors d'un
    // nouveau partage ne doit pas survivre via un partage antérieur.
    const share = await this.prisma.propertyShare.findFirst({
      where: {
        propertyId,
        userId: user.id,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: { allowGoogleEarth: true },
    });

    if (!share?.allowGoogleEarth) throw this.notFound();
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      message: "Ce fichier n'existe pas ou ne vous est pas accessible.",
      error: 'NOT_FOUND',
    });
  }
}

/**
 * Neuf décimales ≈ 0,1 mm — la colonne est `Decimal(12,9)`. Au-delà, les
 * chiffres d'un export Google Earth Pro ne sont que du bruit de flottant.
 */
function round9(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}
