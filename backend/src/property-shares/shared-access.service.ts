import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, ShareStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import { EarthLinkService } from './earth-link.service';

/**
 * Vue exposée au bénéficiaire d'un partage (§22).
 *
 * Construite en **liste blanche** : chaque champ est recopié explicitement
 * depuis l'entité. Un champ ajouté plus tard au modèle `Property` — une note
 * interne, un prix, un contact — n'apparaîtra donc jamais ici par accident, ce
 * qui serait le risque d'une approche par suppression de champs.
 */
export interface SharedPropertyView {
  id: string;
  reference: string;
  name: string;
  location: { name: string };
  site: { name: string } | null;
  area: string;
  areaUnit: string;
  areaSqm: string;
  status: string;
  description: string | null;
  coordinates: Array<{
    label: string | null;
    latitude: string;
    longitude: string;
    altitude: string | null;
    isPrimary: boolean;
  }>;
  googleMapsUrl: string | null;
  googleEarthUrl: string | null;
  /** Lien KML stable, ouvrable dans Google Earth sans session (voir EarthLinkService). */
  earthLinkUrl: string | null;
  geoFiles: Array<{ id: string; fileName: string; format: string }>;
  documentCount: number;
  share: {
    expiresAt: Date;
    allowDocuments: boolean;
    allowCoordinates: boolean;
    allowGoogleEarth: boolean;
  };
}

@Injectable()
export class SharedAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly earthLinks: EarthLinkService,
  ) {}

  /** Liste des biens partagés avec ce bénéficiaire, en version resserrée. */
  async findMyProperties(user: AuthenticatedUser) {
    const shares = await this.findActiveShares(user.id);

    // Un bien partagé plusieurs fois n'apparaît qu'une fois, avec le partage
    // le plus récent (la liste arrive triée du plus récent au plus ancien).
    const seen = new Set<string>();
    const latest = shares.filter((share) => {
      if (seen.has(share.property.id)) return false;
      seen.add(share.property.id);
      return true;
    });

    return latest.map((share) => ({
      id: share.property.id,
      reference: share.property.reference,
      name: share.property.name,
      location: { name: share.property.location.name },
      site: share.property.site ? { name: share.property.site.name } : null,
      status: share.property.status,
      expiresAt: share.expiresAt,
    }));
  }

  async findProperty(
    user: AuthenticatedUser,
    propertyId: string,
    context: RequestContext,
  ): Promise<SharedPropertyView> {
    const share = await this.findActiveShare(user.id, propertyId);

    // Trace de consultation : l'administrateur doit pouvoir constater l'usage
    // réel d'un accès qu'il a accordé.
    await this.prisma.propertyShare.update({
      where: { id: share.id },
      data: { lastAccessedAt: new Date() },
    });

    await this.audit.record({
      userId: user.id,
      action: AuditAction.VIEW,
      entity: 'Property',
      entityId: propertyId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { via: 'SHARE', shareId: share.id },
    });

    const property = share.property;

    return {
      id: property.id,
      reference: property.reference,
      name: property.name,
      location: { name: property.location.name },
      site: property.site ? { name: property.site.name } : null,
      area: property.area.toString(),
      areaUnit: property.areaUnit,
      areaSqm: property.areaSqm.toString(),
      status: property.status,
      description: property.description,
      coordinates: share.allowCoordinates
        ? property.coordinates.map((point) => ({
            label: point.label,
            latitude: point.latitude.toString(),
            longitude: point.longitude.toString(),
            altitude: point.altitude ? point.altitude.toString() : null,
            isPrimary: point.isPrimary,
          }))
        : [],
      googleMapsUrl: share.allowGoogleEarth ? property.googleMapsUrl : null,
      googleEarthUrl: share.allowGoogleEarth ? property.googleEarthUrl : null,
      earthLinkUrl: share.allowGoogleEarth ? this.earthLinks.buildUrl(share.id) : null,
      geoFiles: share.allowGoogleEarth
        ? property.geoFiles.map((file) => ({
            id: file.id,
            fileName: file.fileName,
            format: file.format,
          }))
        : [],
      documentCount: share.allowDocuments
        ? share.documents.filter(({ document }) => document.deletedAt === null).length
        : 0,
      share: {
        expiresAt: share.expiresAt,
        allowDocuments: share.allowDocuments,
        allowCoordinates: share.allowCoordinates,
        allowGoogleEarth: share.allowGoogleEarth,
      },
    };
  }

  /** Documents de la liste blanche uniquement. */
  async findDocuments(user: AuthenticatedUser, propertyId: string) {
    const share = await this.findActiveShare(user.id, propertyId);

    if (!share.allowDocuments) return [];

    return share.documents
      .filter(({ document }) => document.deletedAt === null)
      .map(({ document }) => ({
        id: document.id,
        name: document.name,
        type: document.type,
        fileName: document.fileName,
        mimeType: document.mimeType,
        size: document.size,
        createdAt: document.createdAt,
      }));
  }

  /**
   * URL signée d'un document partagé.
   *
   * L'autorisation est revérifiée ici, et pas seulement à la liste : un
   * bénéficiaire pourrait avoir mémorisé un identifiant de document retiré
   * depuis de sa liste blanche.
   */
  async getDocumentDownloadUrl(
    user: AuthenticatedUser,
    documentId: string,
    context: RequestContext,
  ) {
    const document = await this.prisma.propertyDocument.findFirst({
      where: { id: documentId, deletedAt: null },
      select: {
        id: true,
        storageKey: true,
        fileName: true,
        mimeType: true,
        propertyId: true,
      },
    });

    if (!document) throw this.notFound();

    // Seul le partage en vigueur — le plus récent — fait foi : un document
    // présent dans un partage antérieur, mais retiré du dernier, est refusé.
    const share = await this.findActiveShare(user.id, document.propertyId);
    const whitelisted = share.documents.some((entry) => entry.document.id === documentId);

    if (!share.allowDocuments || !whitelisted) throw this.notFound();

    const link = { shareId: share.id, document };

    const signed = await this.storage.getSignedDownloadUrl(
      link.document.storageKey,
      link.document.fileName,
    );

    await this.audit.record({
      userId: user.id,
      action: AuditAction.DOWNLOAD,
      entity: 'PropertyDocument',
      entityId: documentId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { via: 'SHARE', shareId: link.shareId },
    });

    return {
      url: signed.url,
      expiresIn: signed.expiresIn,
      fileName: link.document.fileName,
      mimeType: link.document.mimeType,
    };
  }

  /** URL signée d'un fichier Google Earth partagé. */
  async getGeoFileDownloadUrl(
    user: AuthenticatedUser,
    propertyId: string,
    fileId: string,
    context: RequestContext,
  ) {
    const share = await this.findActiveShare(user.id, propertyId);

    if (!share.allowGoogleEarth) throw this.notFound();

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
      metadata: { via: 'SHARE', shareId: share.id },
    });

    return {
      url: signed.url,
      expiresIn: signed.expiresIn,
      fileName: file.fileName,
      mimeType: file.mimeType,
    };
  }

  // --- Règles internes ------------------------------------------------------

  private findActiveShares(userId: string) {
    return this.prisma.propertyShare.findMany({
      where: {
        userId,
        status: ShareStatus.ACTIVE,
        expiresAt: { gt: new Date() },
        property: { deletedAt: null },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        expiresAt: true,
        property: {
          select: {
            id: true,
            reference: true,
            name: true,
            status: true,
            location: { select: { name: true } },
            site: { select: { name: true } },
          },
        },
      },
    });
  }

  private async findActiveShare(userId: string, propertyId: string) {
    const share = await this.prisma.propertyShare.findFirst({
      where: {
        userId,
        propertyId,
        status: ShareStatus.ACTIVE,
        expiresAt: { gt: new Date() },
        property: { deletedAt: null },
      },
      // Plusieurs partages actifs peuvent coexister (données antérieures au
      // remplacement automatique) : le plus récent est celui qui fait foi.
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        expiresAt: true,
        allowDocuments: true,
        allowCoordinates: true,
        allowGoogleEarth: true,
        documents: {
          select: {
            document: {
              select: {
                id: true,
                name: true,
                type: true,
                fileName: true,
                mimeType: true,
                size: true,
                createdAt: true,
                deletedAt: true,
              },
            },
          },
        },
        property: {
          select: {
            id: true,
            reference: true,
            name: true,
            area: true,
            areaUnit: true,
            areaSqm: true,
            status: true,
            description: true,
            googleMapsUrl: true,
            googleEarthUrl: true,
            location: { select: { name: true } },
            site: { select: { name: true } },
            coordinates: {
              orderBy: [{ isPrimary: 'desc' }, { pointOrder: 'asc' }],
              select: {
                label: true,
                latitude: true,
                longitude: true,
                altitude: true,
                isPrimary: true,
              },
            },
            geoFiles: {
              where: { deletedAt: null },
              select: { id: true, fileName: true, format: true },
            },
          },
        },
      },
    });

    if (!share) throw this.notFound();
    return share;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      message: "Cette ressource n'existe pas ou ne vous est pas accessible.",
      error: 'NOT_FOUND',
    });
  }
}
