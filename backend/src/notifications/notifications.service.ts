import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResult } from '../common/dto/paginated-result';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { QueryNotificationsDto } from './dto/notification.dto';

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  message: true,
  entityType: true,
  entityId: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser, query: QueryNotificationsDto) {
    const where: Prisma.NotificationWhereInput = {
      userId: user.id,
      ...(query.unreadOnly ? { readAt: null } : {}),
      ...(query.type ? { type: query.type } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        select: NOTIFICATION_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return PaginatedResult.from(items, total, query);
  }

  async unreadCount(user: AuthenticatedUser): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId: user.id, readAt: null },
    });

    return { count };
  }

  /**
   * Marque une notification comme lue.
   *
   * La mise à jour est conditionnée à `userId` : impossible de marquer lue la
   * notification d'un autre utilisateur en devinant son identifiant.
   */
  async markAsRead(user: AuthenticatedUser, id: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });

    if (count === 0) {
      // Déjà lue ou inexistante : on vérifie pour distinguer les deux cas.
      const exists = await this.prisma.notification.findFirst({
        where: { id, userId: user.id },
        select: NOTIFICATION_SELECT,
      });

      if (!exists) {
        throw new NotFoundException({
          message: "Cette notification n'existe pas.",
          error: 'NOT_FOUND',
        });
      }

      return exists;
    }

    return this.prisma.notification.findFirstOrThrow({
      where: { id, userId: user.id },
      select: NOTIFICATION_SELECT,
    });
  }

  async markAllAsRead(user: AuthenticatedUser): Promise<{ updated: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });

    return { updated: count };
  }

  /**
   * Crée une notification.
   *
   * Comme l'audit, une notification ne doit jamais faire échouer l'action
   * métier qui la déclenche : l'erreur est journalisée, pas propagée.
   */
  async create(payload: NotificationPayload): Promise<void> {
    try {
      await this.prisma.notification.create({ data: payload });
    } catch (error) {
      this.logger.warn(
        `Notification non créée pour ${payload.userId} : ${(error as Error).message}`,
      );
    }
  }

  /** Diffuse une même notification à plusieurs destinataires. */
  async createMany(
    userIds: string[],
    payload: Omit<NotificationPayload, 'userId'>,
  ): Promise<void> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return;

    try {
      await this.prisma.notification.createMany({
        data: unique.map((userId) => ({ userId, ...payload })),
      });
    } catch (error) {
      this.logger.warn(
        `Notifications non créées (${unique.length} destinataires) : ${(error as Error).message}`,
      );
    }
  }
}
