import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  userId?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Journal d'audit (§26) — table append-only.
 *
 * L'écriture ne doit jamais faire échouer l'action métier qu'elle trace :
 * une erreur d'audit est journalisée côté serveur, pas propagée au client.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent?.slice(0, 500) ?? null,
          metadata: entry.metadata,
        },
      });
    } catch (error) {
      this.logger.error(
        `Écriture du journal d'audit impossible (${entry.action} ${entry.entity}) : ${
          (error as Error).message
        }`,
      );
    }
  }

  /**
   * Trace une action réalisée dans une transaction métier.
   * Utilisé quand l'audit doit être atomique avec l'écriture (création d'un
   * partage, changement de statut) : ici l'erreur *est* propagée.
   */
  async recordInTransaction(
    tx: Prisma.TransactionClient,
    entry: AuditEntry,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent?.slice(0, 500) ?? null,
        metadata: entry.metadata,
      },
    });
  }
}
