import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma, ShareStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/services/password.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResult } from '../common/dto/paginated-result';
import { ScopeService } from '../common/services/scope.service';
import { ROLES } from '../common/constants/rbac.constants';
import { generateSecureToken, hashToken } from '../common/utils/crypto.util';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type {
  ActivateShareDto,
  CreateShareDto,
  QuerySharesDto,
} from './dto/property-share.dto';

/**
 * Projection administrateur.
 * `tokenHash` n'y figure jamais : il ne doit sortir ni de la base ni des logs.
 */
const SHARE_SELECT = {
  id: true,
  propertyId: true,
  beneficiaryFirstName: true,
  beneficiaryLastName: true,
  beneficiaryEmail: true,
  beneficiaryPhone: true,
  message: true,
  status: true,
  expiresAt: true,
  activatedAt: true,
  revokedAt: true,
  lastAccessedAt: true,
  allowDocuments: true,
  allowCoordinates: true,
  allowGoogleEarth: true,
  createdAt: true,
  property: { select: { id: true, reference: true, name: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  revokedBy: { select: { id: true, firstName: true, lastName: true } },
  documents: { select: { document: { select: { id: true, name: true } } } },
} satisfies Prisma.PropertyShareSelect;

const SORTABLE = ['createdAt', 'expiresAt', 'status'] as const;

@Injectable()
export class PropertySharesService {
  private readonly logger = new Logger(PropertySharesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Consultation (administrateur)
  // -------------------------------------------------------------------------

  async findAll(user: AuthenticatedUser, query: QuerySharesDto) {
    const filters: Prisma.PropertyShareWhereInput = {};

    if (query.status) filters.status = query.status;
    if (query.propertyId) filters.propertyId = query.propertyId;

    if (query.search) {
      filters.OR = [
        { beneficiaryEmail: { contains: query.search, mode: 'insensitive' } },
        { beneficiaryLastName: { contains: query.search, mode: 'insensitive' } },
        { property: { reference: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const where: Prisma.PropertyShareWhereInput = {
      AND: [{ property: this.scope.propertyFilter(user) }, filters],
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.propertyShare.findMany({
        where,
        select: SHARE_SELECT,
        orderBy: query.buildOrderBy(SORTABLE, 'createdAt'),
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.propertyShare.count({ where }),
    ]);

    return PaginatedResult.from(items, total, query);
  }

  async findForProperty(user: AuthenticatedUser, propertyId: string) {
    await this.assertPropertyInScope(user, propertyId);

    return this.prisma.propertyShare.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      select: SHARE_SELECT,
    });
  }

  // -------------------------------------------------------------------------
  // Création
  // -------------------------------------------------------------------------

  /**
   * Crée une invitation (§20).
   *
   * Le token est aléatoire sur 256 bits ; seule son empreinte SHA-256 est
   * stockée. La valeur en clair n'existe que dans l'email envoyé : même une
   * fuite de la base ne permettrait pas de reconstituer un lien valide.
   */
  async create(
    propertyId: string,
    dto: CreateShareDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    const property = await this.prisma.property.findFirst({
      where: { AND: [this.scope.propertyFilter(actor), { id: propertyId }] },
      select: { id: true, reference: true, name: true },
    });

    if (!property) throw this.propertyNotFound();

    const expiresAt = new Date(dto.expiresAt);

    if (expiresAt <= new Date()) {
      throw new BadRequestException({
        message: "La date d'expiration doit être dans le futur.",
        error: 'VALIDATION_ERROR',
        details: [{ field: 'expiresAt', message: 'Date déjà passée' }],
      });
    }

    await this.assertNoActiveShare(propertyId, dto.email);
    await this.assertDocumentsBelongToProperty(propertyId, dto.documentIds);

    const token = generateSecureToken(32);

    const share = await this.prisma.$transaction(async (tx) => {
      const created = await tx.propertyShare.create({
        data: {
          propertyId,
          beneficiaryFirstName: dto.firstName,
          beneficiaryLastName: dto.lastName,
          beneficiaryEmail: dto.email,
          beneficiaryPhone: dto.phone,
          message: dto.message,
          tokenHash: hashToken(token),
          status: ShareStatus.PENDING,
          expiresAt,
          allowDocuments: dto.allowDocuments ?? true,
          allowCoordinates: dto.allowCoordinates ?? true,
          allowGoogleEarth: dto.allowGoogleEarth ?? true,
          createdById: actor.id,
          documents: dto.documentIds?.length
            ? { create: dto.documentIds.map((documentId) => ({ documentId })) }
            : undefined,
        },
        select: SHARE_SELECT,
      });

      await this.audit.recordInTransaction(tx, {
        userId: actor.id,
        action: AuditAction.SHARE,
        entity: 'PropertyShare',
        entityId: created.id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: {
          propertyId,
          propertyReference: property.reference,
          beneficiaryEmail: dto.email,
          expiresAt: expiresAt.toISOString(),
          documentCount: dto.documentIds?.length ?? 0,
        },
      });

      return created;
    });

    const sent = await this.mail.sendShareInvitation({
      to: dto.email,
      firstName: dto.firstName,
      senderName: `${actor.firstName} ${actor.lastName}`,
      propertyName: property.name,
      propertyReference: property.reference,
      message: dto.message,
      token,
      expiresAt,
    });

    if (!sent) {
      this.logger.warn(
        `Invitation ${share.id} créée mais email non délivré à ${dto.email} — utiliser /resend.`,
      );
    }

    return { ...share, invitationSent: sent };
  }

  /**
   * Réémet une invitation restée `PENDING`.
   * Un nouveau token est généré : l'ancien lien cesse immédiatement d'être
   * valide, ce qui évite que deux liens coexistent.
   */
  async resend(
    propertyId: string,
    shareId: string,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    await this.assertPropertyInScope(actor, propertyId);

    const share = await this.prisma.propertyShare.findFirst({
      where: { id: shareId, propertyId },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        beneficiaryEmail: true,
        beneficiaryFirstName: true,
        message: true,
        property: { select: { name: true, reference: true } },
      },
    });

    if (!share) throw this.shareNotFound();

    if (share.status !== ShareStatus.PENDING) {
      throw new ConflictException({
        message: `Seule une invitation en attente peut être renvoyée (statut actuel : ${share.status}).`,
        error: 'CONFLICT',
      });
    }

    if (share.expiresAt <= new Date()) {
      throw new ConflictException({
        message: "Cette invitation a expiré : créez-en une nouvelle.",
        error: 'CONFLICT',
      });
    }

    const token = generateSecureToken(32);

    await this.prisma.propertyShare.update({
      where: { id: shareId },
      data: { tokenHash: hashToken(token) },
    });

    const sent = await this.mail.sendShareInvitation({
      to: share.beneficiaryEmail,
      firstName: share.beneficiaryFirstName,
      senderName: `${actor.firstName} ${actor.lastName}`,
      propertyName: share.property.name,
      propertyReference: share.property.reference,
      message: share.message,
      token,
      expiresAt: share.expiresAt,
    });

    await this.audit.record({
      userId: actor.id,
      action: AuditAction.SHARE,
      entity: 'PropertyShare',
      entityId: shareId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { action: 'RESEND', delivered: sent },
    });

    return { invitationSent: sent };
  }

  // -------------------------------------------------------------------------
  // Révocation
  // -------------------------------------------------------------------------

  /**
   * Révoque un partage (§21).
   *
   * L'effet est **immédiat** : incrémenter `tokenVersion` invalide les access
   * tokens déjà émis, et révoquer les refresh tokens ferme la session en cours.
   * Sans cela, le bénéficiaire conserverait l'accès jusqu'à l'expiration
   * naturelle de son JWT.
   */
  async revoke(
    propertyId: string,
    shareId: string,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<void> {
    await this.assertPropertyInScope(actor, propertyId);

    const share = await this.prisma.propertyShare.findFirst({
      where: { id: shareId, propertyId },
      select: {
        id: true,
        status: true,
        userId: true,
        beneficiaryEmail: true,
        beneficiaryFirstName: true,
        property: { select: { reference: true } },
      },
    });

    if (!share) throw this.shareNotFound();

    if (share.status === ShareStatus.REVOKED) {
      throw new ConflictException({
        message: 'Ce partage est déjà révoqué.',
        error: 'CONFLICT',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.propertyShare.update({
        where: { id: shareId },
        data: {
          status: ShareStatus.REVOKED,
          revokedAt: new Date(),
          revokedById: actor.id,
        },
      });

      if (share.userId) {
        await tx.user.update({
          where: { id: share.userId },
          data: { tokenVersion: { increment: 1 } },
        });

        await tx.refreshToken.updateMany({
          where: { userId: share.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        // Un bénéficiaire sans aucun partage actif n'a plus rien à consulter :
        // son compte est désactivé plutôt que laissé ouvert sur un écran vide.
        const remaining = await tx.propertyShare.count({
          where: {
            userId: share.userId,
            status: ShareStatus.ACTIVE,
            expiresAt: { gt: new Date() },
            id: { not: shareId },
          },
        });

        if (remaining === 0) {
          await tx.user.update({
            where: { id: share.userId },
            data: { isActive: false },
          });
        }
      }

      await this.audit.recordInTransaction(tx, {
        userId: actor.id,
        action: AuditAction.REVOKE_SHARE,
        entity: 'PropertyShare',
        entityId: shareId,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: {
          propertyId,
          propertyReference: share.property.reference,
          beneficiaryEmail: share.beneficiaryEmail,
        },
      });
    });

    await this.mail.sendShareRevoked({
      to: share.beneficiaryEmail,
      firstName: share.beneficiaryFirstName,
      propertyReference: share.property.reference,
    });
  }

  // -------------------------------------------------------------------------
  // Parcours public du bénéficiaire
  // -------------------------------------------------------------------------

  /**
   * Vérifie une invitation sans l'activer.
   *
   * La réponse reste volontairement pauvre : elle confirme la validité du lien
   * et rappelle la référence du bien, sans exposer d'information patrimoniale
   * à qui présenterait un token au hasard.
   */
  async validateToken(token: string) {
    const share = await this.prisma.propertyShare.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        status: true,
        expiresAt: true,
        beneficiaryFirstName: true,
        property: { select: { reference: true, deletedAt: true } },
      },
    });

    const usable =
      share !== null &&
      share.status === ShareStatus.PENDING &&
      share.expiresAt > new Date() &&
      share.property.deletedAt === null;

    if (!usable) return { valid: false };

    return {
      valid: true,
      propertyReference: share.property.reference,
      beneficiaryFirstName: share.beneficiaryFirstName,
      expiresAt: share.expiresAt,
      requiresPassword: true,
    };
  }

  /**
   * Active un partage : le bénéficiaire définit **lui-même** son mot de passe
   * (§21), qui ne transite donc jamais par un tiers.
   *
   * Si l'adresse correspond déjà à un compte partagé existant, celui-ci est
   * réutilisé plutôt que dupliqué.
   */
  async activate(dto: ActivateShareDto, context: RequestContext) {
    const share = await this.prisma.propertyShare.findUnique({
      where: { tokenHash: hashToken(dto.token) },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        beneficiaryEmail: true,
        beneficiaryFirstName: true,
        beneficiaryLastName: true,
        beneficiaryPhone: true,
        property: { select: { id: true, reference: true, deletedAt: true } },
      },
    });

    if (
      !share ||
      share.status !== ShareStatus.PENDING ||
      share.expiresAt <= new Date() ||
      share.property.deletedAt !== null
    ) {
      throw new BadRequestException({
        message: "Ce lien d'activation est invalide ou a expiré.",
        error: 'VALIDATION_ERROR',
      });
    }

    const sharedRole = await this.prisma.role.findUniqueOrThrow({
      where: { code: ROLES.UTILISATEUR_PARTAGE },
      select: { id: true },
    });

    const passwordHash = await this.passwords.hash(dto.password);

    const userId = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { email: share.beneficiaryEmail, deletedAt: null },
        select: {
          id: true,
          roles: { select: { role: { select: { code: true } } } },
        },
      });

      if (existing) {
        const isSharedAccount = existing.roles.every(
          ({ role }) => role.code === ROLES.UTILISATEUR_PARTAGE,
        );

        // Un compte interne ne doit jamais être transformé en compte partagé :
        // cela écraserait son mot de passe et ses rôles.
        if (!isSharedAccount) {
          throw new ConflictException({
            message:
              'Cette adresse correspond déjà à un compte de la plateforme. Connectez-vous avec vos identifiants habituels.',
            error: 'CONFLICT',
          });
        }

        await tx.user.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            isActive: true,
            mustChangePassword: false,
            emailVerifiedAt: new Date(),
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });

        return existing.id;
      }

      const created = await tx.user.create({
        data: {
          email: share.beneficiaryEmail,
          firstName: share.beneficiaryFirstName,
          lastName: share.beneficiaryLastName,
          phone: share.beneficiaryPhone,
          passwordHash,
          isActive: true,
          emailVerifiedAt: new Date(),
          roles: { create: { roleId: sharedRole.id } },
        },
        select: { id: true },
      });

      return created.id;
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.propertyShare.update({
        where: { id: share.id },
        data: {
          userId,
          status: ShareStatus.ACTIVE,
          activatedAt: new Date(),
        },
      });

      await this.audit.recordInTransaction(tx, {
        userId,
        action: AuditAction.LOGIN,
        entity: 'PropertyShare',
        entityId: share.id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: {
          action: 'SHARE_ACTIVATED',
          propertyReference: share.property.reference,
        },
      });
    });

    return {
      activated: true,
      email: share.beneficiaryEmail,
      propertyReference: share.property.reference,
    };
  }

  // -------------------------------------------------------------------------
  // Tâche planifiée
  // -------------------------------------------------------------------------

  /**
   * Bascule en `EXPIRED` les partages échus et coupe les sessions associées
   * (§21). Exécutée toutes les heures par `TasksService`.
   */
  async expireOutdatedShares(): Promise<number> {
    const now = new Date();

    const outdated = await this.prisma.propertyShare.findMany({
      where: {
        status: { in: [ShareStatus.PENDING, ShareStatus.ACTIVE] },
        expiresAt: { lte: now },
      },
      select: { id: true, userId: true },
    });

    if (outdated.length === 0) return 0;

    const userIds = [
      ...new Set(outdated.map((share) => share.userId).filter((id): id is string => !!id)),
    ];

    await this.prisma.$transaction(async (tx) => {
      await tx.propertyShare.updateMany({
        where: { id: { in: outdated.map((share) => share.id) } },
        data: { status: ShareStatus.EXPIRED },
      });

      if (userIds.length > 0) {
        await tx.user.updateMany({
          where: { id: { in: userIds } },
          data: { tokenVersion: { increment: 1 } },
        });

        await tx.refreshToken.updateMany({
          where: { userId: { in: userIds }, revokedAt: null },
          data: { revokedAt: now },
        });

        // Désactive les bénéficiaires qui n'ont plus aucun partage actif.
        const stillActive = await tx.propertyShare.findMany({
          where: {
            userId: { in: userIds },
            status: ShareStatus.ACTIVE,
            expiresAt: { gt: now },
          },
          select: { userId: true },
        });

        const keep = new Set(stillActive.map((share) => share.userId));
        const toDeactivate = userIds.filter((id) => !keep.has(id));

        if (toDeactivate.length > 0) {
          await tx.user.updateMany({
            where: { id: { in: toDeactivate } },
            data: { isActive: false },
          });
        }
      }
    });

    this.logger.log(`${outdated.length} partage(s) expiré(s) désactivé(s).`);
    return outdated.length;
  }

  // -------------------------------------------------------------------------
  // Règles internes
  // -------------------------------------------------------------------------

  private async assertPropertyInScope(
    user: AuthenticatedUser,
    propertyId: string,
  ): Promise<void> {
    const count = await this.prisma.property.count({
      where: { AND: [this.scope.propertyFilter(user), { id: propertyId }] },
    });

    if (count === 0) throw this.propertyNotFound();
  }

  /**
   * Un même bénéficiaire ne peut pas cumuler deux invitations ouvertes sur le
   * même bien : cela produirait deux liens valides et des droits contradictoires.
   */
  private async assertNoActiveShare(
    propertyId: string,
    email: string,
  ): Promise<void> {
    const existing = await this.prisma.propertyShare.findFirst({
      where: {
        propertyId,
        beneficiaryEmail: email,
        status: { in: [ShareStatus.PENDING, ShareStatus.ACTIVE] },
      },
      select: { id: true, status: true },
    });

    if (existing) {
      throw new ConflictException({
        message: `Un partage ${existing.status === ShareStatus.PENDING ? 'en attente' : 'actif'} existe déjà pour cette adresse sur ce bien.`,
        error: 'CONFLICT',
        details: [{ field: 'email', message: 'Partage déjà existant' }],
      });
    }
  }

  /** La liste blanche ne peut contenir que des documents de ce bien (§22). */
  private async assertDocumentsBelongToProperty(
    propertyId: string,
    documentIds?: string[],
  ): Promise<void> {
    if (!documentIds?.length) return;

    const unique = [...new Set(documentIds)];

    const found = await this.prisma.propertyDocument.findMany({
      where: { id: { in: unique }, propertyId, deletedAt: null },
      select: { id: true },
    });

    if (found.length !== unique.length) {
      const known = new Set(found.map((document) => document.id));
      const missing = unique.filter((id) => !known.has(id));

      throw new BadRequestException({
        message:
          "Un ou plusieurs documents sélectionnés n'appartiennent pas à ce bien.",
        error: 'VALIDATION_ERROR',
        details: missing.map((id) => ({
          field: 'documentIds',
          message: `Document invalide : ${id}`,
        })),
      });
    }
  }

  private propertyNotFound(): NotFoundException {
    return new NotFoundException({
      message: "Ce terrain n'existe pas ou ne vous est pas accessible.",
      error: 'NOT_FOUND',
    });
  }

  private shareNotFound(): NotFoundException {
    return new NotFoundException({
      message: "Ce partage n'existe pas.",
      error: 'NOT_FOUND',
    });
  }
}
