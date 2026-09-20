import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BuildingPermitStatus, NotificationType, ShareStatus } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../auth/services/token.service';
import { PropertySharesService } from '../property-shares/property-shares.service';

/**
 * Tâches planifiées (§21, §27).
 *
 * Chaque tâche encapsule ses erreurs : une exception non rattrapée dans un cron
 * de NestJS n'est pas réessayée et passerait inaperçue.
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shares: PropertySharesService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Désactive les accès expirés (§21).
   *
   * Un contrôle horaire complète — sans le remplacer — le filtre
   * `expiresAt > now` appliqué à chaque requête : la base reflète ainsi l'état
   * réel, et l'administrateur voit des statuts justes dans ses écrans.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'expire-shares' })
  async expireShares(): Promise<void> {
    try {
      const count = await this.shares.expireOutdatedShares();
      if (count > 0) {
        this.logger.log(`${count} partage(s) passé(s) en EXPIRED.`);
      }
    } catch (error) {
      this.logger.error(
        `Expiration des partages impossible : ${(error as Error).message}`,
      );
    }
  }

  /** Prévient les bénéficiaires dont l'accès expire bientôt (§27). */
  @Cron(CronExpression.EVERY_DAY_AT_8AM, { name: 'notify-expiring-shares' })
  async notifyExpiringShares(): Promise<void> {
    try {
      const days = this.config.shareExpiryWarningDays;
      const threshold = new Date(Date.now() + days * 86_400_000);

      const shares = await this.prisma.propertyShare.findMany({
        where: {
          status: ShareStatus.ACTIVE,
          expiresAt: { gt: new Date(), lte: threshold },
        },
        select: {
          id: true,
          beneficiaryEmail: true,
          beneficiaryFirstName: true,
          expiresAt: true,
          createdById: true,
          property: { select: { id: true, reference: true } },
        },
      });

      for (const share of shares) {
        const daysLeft = Math.max(
          1,
          Math.ceil((share.expiresAt.getTime() - Date.now()) / 86_400_000),
        );

        await this.mail.sendShareExpiring({
          to: share.beneficiaryEmail,
          firstName: share.beneficiaryFirstName,
          propertyReference: share.property.reference,
          expiresAt: share.expiresAt,
          daysLeft,
        });

        if (share.createdById) {
          await this.notify(share.createdById, {
            type: NotificationType.SHARE_EXPIRING,
            title: 'Un partage expire bientôt',
            message: `L'accès de ${share.beneficiaryEmail} au bien ${share.property.reference} expire dans ${daysLeft} jour(s).`,
            entityType: 'PropertyShare',
            entityId: share.id,
          });
        }
      }

      if (shares.length > 0) {
        this.logger.log(`${shares.length} alerte(s) d'expiration de partage envoyée(s).`);
      }
    } catch (error) {
      this.logger.error(
        `Alertes d'expiration de partage impossibles : ${(error as Error).message}`,
      );
    }
  }

  /** Signale les permis proches de leur échéance et marque ceux qui ont expiré (§27). */
  @Cron(CronExpression.EVERY_DAY_AT_7AM, { name: 'check-permits' })
  async checkPermits(): Promise<void> {
    try {
      const now = new Date();

      const expired = await this.prisma.buildingPermit.updateMany({
        where: {
          deletedAt: null,
          status: BuildingPermitStatus.APPROUVE,
          expiryDate: { lt: now },
        },
        data: { status: BuildingPermitStatus.EXPIRE },
      });

      if (expired.count > 0) {
        this.logger.log(`${expired.count} permis passé(s) en EXPIRE.`);
      }

      const days = this.config.permitExpiryWarningDays;
      const threshold = new Date(Date.now() + days * 86_400_000);

      const expiring = await this.prisma.buildingPermit.findMany({
        where: {
          deletedAt: null,
          status: BuildingPermitStatus.APPROUVE,
          expiryDate: { gte: now, lte: threshold },
        },
        select: {
          id: true,
          number: true,
          expiryDate: true,
          project: {
            select: { id: true, reference: true, managerId: true, createdById: true },
          },
        },
      });

      for (const permit of expiring) {
        const recipient = permit.project.managerId ?? permit.project.createdById;
        if (!recipient || !permit.expiryDate) continue;

        const daysLeft = Math.max(
          1,
          Math.ceil((permit.expiryDate.getTime() - Date.now()) / 86_400_000),
        );

        await this.notify(recipient, {
          type: NotificationType.PERMIT_EXPIRING,
          title: 'Permis proche de son expiration',
          message: `Le permis ${permit.number} du projet ${permit.project.reference} expire dans ${daysLeft} jour(s).`,
          entityType: 'BuildingPermit',
          entityId: permit.id,
        });
      }
    } catch (error) {
      this.logger.error(
        `Contrôle des permis impossible : ${(error as Error).message}`,
      );
    }
  }

  /** Purge les tokens expirés (§30). */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'purge-tokens' })
  async purgeTokens(): Promise<void> {
    try {
      const refreshTokens = await this.tokens.purgeExpired(30);

      const { count: temporaryTokens } =
        await this.prisma.temporaryAccessToken.deleteMany({
          where: {
            OR: [
              { expiresAt: { lt: new Date(Date.now() - 30 * 86_400_000) } },
              { usedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } },
            ],
          },
        });

      if (refreshTokens + temporaryTokens > 0) {
        this.logger.log(
          `Purge : ${refreshTokens} refresh token(s), ${temporaryTokens} token(s) temporaire(s).`,
        );
      }
    } catch (error) {
      this.logger.error(`Purge des tokens impossible : ${(error as Error).message}`);
    }
  }

  /**
   * Crée une notification in-app.
   * Isolée ici pour que l'échec d'une notification n'interrompe pas la boucle
   * de la tâche en cours.
   */
  private async notify(
    userId: string,
    payload: {
      type: NotificationType;
      title: string;
      message: string;
      entityType: string;
      entityId: string;
    },
  ): Promise<void> {
    try {
      await this.prisma.notification.create({ data: { userId, ...payload } });
    } catch (error) {
      this.logger.warn(
        `Notification non créée pour ${userId} : ${(error as Error).message}`,
      );
    }
  }
}
