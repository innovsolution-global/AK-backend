import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResult } from '../common/dto/paginated-result';
import type { QueryAuditLogsDto } from './dto/audit.dto';

const AUDIT_SELECT = {
  id: true,
  action: true,
  entity: true,
  entityId: true,
  ip: true,
  userAgent: true,
  metadata: true,
  createdAt: true,
  user: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} satisfies Prisma.AuditLogSelect;

/**
 * Consultation du journal d'audit (§26).
 *
 * Lecture seule par construction : aucune méthode d'écriture, de mise à jour ni
 * de suppression n'est exposée. L'écriture passe par `AuditService`.
 */
@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryAuditLogsDto) {
    const where: Prisma.AuditLogWhereInput = {};

    if (query.userId) where.userId = query.userId;
    if (query.action) where.action = query.action;
    if (query.entity) where.entity = query.entity;
    if (query.entityId) where.entityId = query.entityId;

    if (query.from || query.to) {
      where.createdAt = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
    }

    if (query.search) {
      where.OR = [
        { entity: { contains: query.search, mode: 'insensitive' } },
        { entityId: { contains: query.search, mode: 'insensitive' } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        select: AUDIT_SELECT,
        // Tri figé sur la date : l'audit se lit chronologiquement, et un tri
        // libre n'apporterait rien tout en coûtant des index.
        orderBy: { createdAt: query.order },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return PaginatedResult.from(items, total, query);
  }

  async findOne(id: string) {
    const entry = await this.prisma.auditLog.findUnique({
      where: { id },
      select: AUDIT_SELECT,
    });

    if (!entry) {
      throw new NotFoundException({
        message: "Cette entrée d'audit n'existe pas.",
        error: 'NOT_FOUND',
      });
    }

    return entry;
  }

  /** Répartition des actions sur les 30 derniers jours. */
  async statistics() {
    const since = new Date(Date.now() - 30 * 86_400_000);

    const [byAction, byEntity, total] = await Promise.all([
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        orderBy: { action: 'asc' },
      }),
      this.prisma.auditLog.groupBy({
        by: ['entity'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        orderBy: { entity: 'asc' },
      }),
      this.prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
    ]);

    return {
      periodDays: 30,
      total,
      byAction: byAction
        .map((group) => ({ action: group.action, count: group._count._all }))
        .sort((a, b) => b.count - a.count),
      byEntity: byEntity
        .map((group) => ({ entity: group.entity, count: group._count._all }))
        .sort((a, b) => b.count - a.count),
    };
  }
}
