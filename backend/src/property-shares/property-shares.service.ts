import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, NotificationType, Prisma, ShareStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/services/password.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResult } from '../common/dto/paginated-result';
import { ScopeService } from '../common/services/scope.service';
import { ROLES } from '../common/constants/rbac.constants';
import {
  generateSecureToken,
  generateTemporaryPassword,
  hashToken,
} from '../common/utils/crypto.util';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type { CreateShareDto, QuerySharesDto } from './dto/property-share.dto';
import { EarthLinkService } from './earth-link.service';

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
    private readonly notifications: NotificationsService,
    private readonly earthLinks: EarthLinkService,
  ) {}

  /**
   * Ajoute le lien Google Earth aux partages qui peuvent en avoir un : c'est
   * ce lien que le gestionnaire copie pour l'envoyer au bénéficiaire par le
   * canal de son choix.
   */
  private withEarthLink<
    T extends {
      id: string;
      status: ShareStatus;
      allowGoogleEarth: boolean;
      expiresAt: Date;
    },
  >(share: T): T & { earthLinkUrl: string | null } {
    const linkable =
      share.allowGoogleEarth &&
      share.expiresAt > new Date() &&
      (share.status === ShareStatus.PENDING || share.status === ShareStatus.ACTIVE);

    return {
      ...share,
      earthLinkUrl: linkable ? this.earthLinks.buildUrl(share.id) : null,
    };
  }

  // -------------------------------------------------------------------------
  // Consultation (administrateur)
  // -------------------------------------------------------------------------

  async findAll(user: AuthenticatedUser, query: QuerySharesDto) {
    const filters: Prisma.PropertyShareWhereInput = {};

    if (query.status) filters.status = query.status;
    if (query.propertyId) filters.propertyId = query.propertyId;

    if (query.expiringInDays) {
      // Fenêtre ouverte sur maintenant : un accès déjà expiré n'a plus rien à
      // renouveler, et son statut le dit déjà.
      const now = new Date();
      const limit = new Date(now.getTime() + query.expiringInDays * 86_400_000);

      filters.expiresAt = { gt: now, lte: limit };
    }

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

    return PaginatedResult.from(
      items.map((share) => this.withEarthLink(share)),
      total,
      query,
    );
  }

  async findForProperty(user: AuthenticatedUser, propertyId: string) {
    await this.assertPropertyInScope(user, propertyId);

    const shares = await this.prisma.propertyShare.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      select: SHARE_SELECT,
    });

    return shares.map((share) => this.withEarthLink(share));
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

    await this.assertDocumentsBelongToProperty(propertyId, dto.documentIds);

    // Le compte du bénéficiaire est créé tout de suite, avec le mot de passe
    // que l'email transporte : des accès utilisables, sans étape d'activation.
    const account = await this.provisionBeneficiary({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
    });

    // Le jeton n'est plus transmis : la colonne reste unique et non nulle, et
    // conserver une valeur aléatoire évite toute collision entre partages.
    const token = generateSecureToken(32);

    const share = await this.prisma.$transaction(async (tx) => {
      // Un nouveau partage du même bien à la même personne remplace les
      // précédents : sa portée (documents, coordonnées, Google Earth) est celle
      // que l'administrateur vient de choisir. Laisser les anciens actifs
      // cumulerait les autorisations — un document retiré resterait visible.
      const superseded = await tx.propertyShare.updateMany({
        where: {
          propertyId,
          status: { in: [ShareStatus.ACTIVE, ShareStatus.PENDING] },
          OR: [
            { beneficiaryEmail: { equals: dto.email, mode: 'insensitive' } },
            { userId: account.userId },
          ],
        },
        data: {
          status: ShareStatus.REVOKED,
          revokedAt: new Date(),
          revokedById: actor.id,
        },
      });

      const created = await tx.propertyShare.create({
        data: {
          propertyId,
          beneficiaryFirstName: dto.firstName,
          beneficiaryLastName: dto.lastName,
          beneficiaryEmail: dto.email,
          beneficiaryPhone: dto.phone,
          message: dto.message,
          tokenHash: hashToken(token),
          userId: account.userId,
          status: ShareStatus.ACTIVE,
          activatedAt: new Date(),
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
          accountCreated: account.created,
          supersededShares: superseded.count,
        },
      });

      return created;
    });

    const shareWithLink = this.withEarthLink(share);

    const sent = await this.mail.sendShareInvitation({
      to: dto.email,
      firstName: dto.firstName,
      senderName: `${actor.firstName} ${actor.lastName}`,
      propertyId,
      propertyName: property.name,
      propertyReference: property.reference,
      message: dto.message,
      temporaryPassword: account.temporaryPassword,
      expiresAt,
    });

    if (!sent) {
      this.logger.warn(
        `Invitation ${share.id} créée mais email non délivré à ${dto.email} — utiliser /resend.`,
      );
    }

    // §27 — les gestionnaires du bien sont informés qu'un tiers y a désormais
    // accès, même s'ils ne sont pas à l'origine du partage.
    const managers = await this.prisma.propertyManager.findMany({
      where: { propertyId, userId: { not: actor.id } },
      select: { userId: true },
    });

    await this.notifications.createMany(
      managers.map((manager) => manager.userId),
      {
        type: NotificationType.SHARE_CREATED,
        title: `Nouveau partage sur ${property.reference}`,
        message: `${actor.firstName} ${actor.lastName} a partagé ${property.reference} avec ${dto.email} jusqu'au ${expiresAt.toLocaleDateString('fr-FR')}.`,
        entityType: 'PropertyShare',
        entityId: share.id,
      },
    );

    return { ...shareWithLink, invitationSent: sent };
  }

  /**
   * Crée — ou retrouve — le compte du bénéficiaire (§21).
   *
   * Un partage doit produire des accès immédiatement utilisables : le compte
   * est provisionné avec un mot de passe généré, que l'email transporte, et
   * qui sert directement à se connecter — aucune étape de redéfinition n'est
   * imposée. Le bénéficiaire peut le changer quand il le souhaite depuis son
   * compte.
   *
   * Chaque invitation régénère ce mot de passe, y compris pour un bénéficiaire
   * qui possède déjà un compte — un deuxième bien lui est partagé. **L'email
   * reçu en dernier porte donc toujours les accès valables** : le précédent
   * cesse de fonctionner et les sessions ouvertes avec lui tombent
   * (`tokenVersion`). Une invitation est ainsi toujours utilisable telle
   * quelle, sans que le destinataire ait à retrouver un message plus ancien.
   */
  private async provisionBeneficiary(beneficiary: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
  }): Promise<{ userId: string; temporaryPassword: string; created: boolean }> {
    const existing = await this.prisma.user.findFirst({
      where: { email: beneficiary.email, deletedAt: null },
      select: {
        id: true,
        isActive: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });

    if (existing) {
      // `every` répond vrai sur un tableau vide : un compte sans aucun rôle
      // aurait été pris pour un compte de partage, et son mot de passe
      // réécrit par la simple invitation de son adresse. On exige donc que le
      // rôle de partage soit présent, et seul.
      const isSharedAccount =
        existing.roles.length > 0 &&
        existing.roles.every(({ role }) => role.code === ROLES.UTILISATEUR_PARTAGE);

      // Un compte interne ne doit jamais devenir un compte de partage : cela
      // écraserait ses rôles et son mot de passe.
      if (!isSharedAccount) {
        throw new ConflictException({
          message:
            'Cette adresse correspond déjà à un compte de la plateforme. Le bien lui sera accessible avec ses identifiants habituels.',
          error: 'CONFLICT',
          details: [{ field: 'email', message: 'Compte interne existant' }],
        });
      }

      // Mot de passe neuf, et compte réactivé s'il avait été désactivé à la
      // révocation de son dernier partage.
      const temporaryPassword = generateTemporaryPassword(14);

      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash: await this.passwords.hash(temporaryPassword),
          isActive: true,
          failedLoginAttempts: 0,
          lockedUntil: null,
          tokenVersion: { increment: 1 },
        },
      });

      return { userId: existing.id, temporaryPassword, created: false };
    }

    const sharedRole = await this.prisma.role.findUniqueOrThrow({
      where: { code: ROLES.UTILISATEUR_PARTAGE },
      select: { id: true },
    });

    const temporaryPassword = generateTemporaryPassword(14);

    const created = await this.prisma.user.create({
      data: {
        email: beneficiary.email,
        firstName: beneficiary.firstName,
        lastName: beneficiary.lastName,
        phone: beneficiary.phone,
        passwordHash: await this.passwords.hash(temporaryPassword),
        isActive: true,
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: sharedRole.id } },
      },
      select: { id: true },
    });

    return { userId: created.id, temporaryPassword, created: true };
  }

  /**
   * Renvoie ses accès au bénéficiaire (§21).
   *
   * Email égaré ou mot de passe perdu : un **nouveau** mot de passe est généré
   * et l'ancien cesse aussitôt de fonctionner — avec les sessions ouvertes
   * avec lui. C'est la seule façon de reprendre la main sur des accès dont on
   * craint qu'ils aient fuité, la révocation mise à part.
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
        allowGoogleEarth: true,
        beneficiaryEmail: true,
        beneficiaryFirstName: true,
        beneficiaryLastName: true,
        beneficiaryPhone: true,
        userId: true,
        message: true,
        property: { select: { name: true, reference: true } },
      },
    });

    if (!share) throw this.shareNotFound();

    if (share.status !== ShareStatus.ACTIVE && share.status !== ShareStatus.PENDING) {
      throw new ConflictException({
        message: `Les accès d'un partage ${share.status.toLowerCase()} ne peuvent pas être renvoyés.`,
        error: 'CONFLICT',
      });
    }

    if (share.expiresAt <= new Date()) {
      throw new ConflictException({
        message: 'Ce partage a expiré : créez-en un nouveau.',
        error: 'CONFLICT',
      });
    }

    let temporaryPassword: string;

    if (share.userId) {
      // Nouveau mot de passe : l'ancien cesse de fonctionner, et
      // `tokenVersion` coupe les sessions ouvertes avec lui.
      temporaryPassword = generateTemporaryPassword(14);

      await this.prisma.user.update({
        where: { id: share.userId },
        data: {
          passwordHash: await this.passwords.hash(temporaryPassword),
          isActive: true,
          failedLoginAttempts: 0,
          lockedUntil: null,
          tokenVersion: { increment: 1 },
        },
      });
    } else {
      // Partage antérieur au provisionnement automatique : il attendait une
      // activation qui n'existe plus, donc personne ne pouvait l'ouvrir. Le
      // renvoi lui donne le compte qui lui manquait.
      const account = await this.provisionBeneficiary({
        email: share.beneficiaryEmail,
        firstName: share.beneficiaryFirstName,
        lastName: share.beneficiaryLastName,
        phone: share.beneficiaryPhone,
      });

      temporaryPassword = account.temporaryPassword;

      await this.prisma.propertyShare.update({
        where: { id: share.id },
        data: {
          userId: account.userId,
          status: ShareStatus.ACTIVE,
          activatedAt: new Date(),
        },
      });
    }

    const sent = await this.mail.sendShareInvitation({
      to: share.beneficiaryEmail,
      firstName: share.beneficiaryFirstName,
      senderName: `${actor.firstName} ${actor.lastName}`,
      propertyId,
      propertyName: share.property.name,
      propertyReference: share.property.reference,
      message: share.message,
      temporaryPassword,
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
      ...new Set(
        outdated.map((share) => share.userId).filter((id): id is string => !!id),
      ),
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
        message: "Un ou plusieurs documents sélectionnés n'appartiennent pas à ce bien.",
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
