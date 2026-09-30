import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditAction, ShareStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { PropertyKmlService } from '../maps/property-kml.service';
import type { RequestContext } from '../auth/auth.service';

const UUID_BYTES = 16;
const HMAC_BYTES = 32;

/**
 * Lien Google Earth d'un partage (§12, §22).
 *
 * Le bénéficiaire doit pouvoir ouvrir l'emprise dans Google Earth — sur
 * ordinateur, téléphone ou dans Google Earth Web — sans passer par un
 * navigateur connecté. Une URL signée S3 expire en cinq minutes ; il faut un
 * lien stable **tant que le partage est actif**.
 *
 * Le token est `base64url(shareId ‖ HMAC-SHA256(secret, shareId))` :
 *   - rien n'est stocké : le lien se recalcule et se vérifie à la volée ;
 *   - il ne peut pas être forgé sans le secret serveur ;
 *   - il est lié au partage : révocation ou expiration → 404 immédiat ;
 *   - il ne contient aucune information patrimoniale.
 */
@Injectable()
export class EarthLinkService {
  private readonly logger = new Logger(EarthLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly propertyKml: PropertyKmlService,
  ) {}

  /** URL publique complète pour un partage donné. */
  buildUrl(shareId: string): string {
    const token = this.sign(shareId);
    return `${this.config.frontendUrl}/${this.config.apiPrefix}/public/earth/${token}.kml`;
  }

  /**
   * Vérifie le token, contrôle l'état du partage et renvoie le KML.
   * Toute anomalie — signature, statut, expiration, option désactivée —
   * produit la même réponse 404 : le lien ne révèle rien de son cycle de vie.
   */
  async resolve(rawToken: string, context: RequestContext) {
    const shareId = this.verify(rawToken);
    if (!shareId) throw this.invalidLink();

    // Un partage en attente d'activation reste valable : le lien KML est
    // lui-même un secret remis par le gestionnaire, au même titre que le lien
    // d'invitation. Révoqué ou expiré, il ne sert plus.
    const share = await this.prisma.propertyShare.findFirst({
      where: {
        id: shareId,
        status: { in: [ShareStatus.PENDING, ShareStatus.ACTIVE] },
        expiresAt: { gt: new Date() },
        allowGoogleEarth: true,
        property: { deletedAt: null },
      },
      select: { id: true, userId: true, propertyId: true },
    });

    if (!share) {
      this.logger.warn(`Lien Google Earth refusé pour le partage ${shareId}`);
      throw this.invalidLink();
    }

    const document = await this.propertyKml.build(share.propertyId);

    await this.prisma.propertyShare.update({
      where: { id: share.id },
      data: { lastAccessedAt: new Date() },
    });

    await this.audit.record({
      userId: share.userId ?? undefined,
      action: AuditAction.DOWNLOAD,
      entity: 'Property',
      entityId: share.propertyId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { via: 'EARTH_LINK', shareId: share.id, format: 'KML' },
    });

    return document;
  }

  // --- Signature ------------------------------------------------------------

  private sign(shareId: string): string {
    const idBytes = uuidToBytes(shareId);
    const mac = createHmac('sha256', this.config.earthLinkSecret)
      .update(idBytes)
      .digest();

    return Buffer.concat([idBytes, mac]).toString('base64url');
  }

  private verify(rawToken: string): string | null {
    const token = rawToken.replace(/\.kml$/i, '');

    let bytes: Buffer;
    try {
      bytes = Buffer.from(token, 'base64url');
    } catch {
      return null;
    }

    if (bytes.length !== UUID_BYTES + HMAC_BYTES) return null;

    const idBytes = bytes.subarray(0, UUID_BYTES);
    const presented = bytes.subarray(UUID_BYTES);
    const expected = createHmac('sha256', this.config.earthLinkSecret)
      .update(idBytes)
      .digest();

    if (!timingSafeEqual(presented, expected)) return null;

    return bytesToUuid(idBytes);
  }

  private invalidLink(): NotFoundException {
    return new NotFoundException({
      message:
        "Ce lien Google Earth n'est plus valide. Le partage a peut-être expiré ou été révoqué.",
      error: 'NOT_FOUND',
    });
  }
}

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
