import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { UpdateRolePermissionsDto } from './dto/role.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Liste des rôles avec leurs permissions et le nombre d'utilisateurs. */
  async findAll() {
    const roles = await this.prisma.role.findMany({
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isSystem: true,
        permissions: { select: { permission: { select: { code: true } } } },
        _count: { select: { users: true } },
      },
    });

    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.permissions.map(({ permission }) => permission.code),
      userCount: role._count.users,
    }));
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isSystem: true,
        permissions: { select: { permission: { select: { code: true } } } },
        _count: { select: { users: true } },
      },
    });

    if (!role) {
      throw new NotFoundException({
        message: "Ce rôle n'existe pas.",
        error: 'NOT_FOUND',
      });
    }

    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.permissions.map(({ permission }) => permission.code),
      userCount: role._count.users,
    };
  }

  /**
   * Remplace l'ensemble des permissions d'un rôle.
   *
   * Les rôles système restent ajustables — c'est le propos du §7 — mais retirer
   * `role.manage` ou `user.manage` à `ADMIN` rendrait la plateforme ingérable :
   * ces deux permissions sont donc verrouillées sur ce rôle.
   */
  async updatePermissions(
    id: string,
    dto: UpdateRolePermissionsDto,
    actor: AuthenticatedUser,
  ) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: { id: true, code: true },
    });

    if (!role) {
      throw new NotFoundException({
        message: "Ce rôle n'existe pas.",
        error: 'NOT_FOUND',
      });
    }

    if (role.code === 'ADMIN') {
      const required = ['user.manage', 'role.manage'];
      const missing = required.filter((code) => !dto.permissions.includes(code));

      if (missing.length > 0) {
        throw new BadRequestException({
          message:
            "Le rôle ADMIN doit conserver la gestion des utilisateurs et des rôles.",
          error: 'VALIDATION_ERROR',
          details: missing.map((code) => ({
            field: 'permissions',
            message: `Permission obligatoire : ${code}`,
          })),
        });
      }
    }

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: dto.permissions } },
      select: { id: true, code: true },
    });

    if (permissions.length !== new Set(dto.permissions).size) {
      const known = new Set(permissions.map((permission) => permission.code));
      const unknown = dto.permissions.filter((code) => !known.has(code));

      throw new BadRequestException({
        message: 'Une ou plusieurs permissions sont inconnues.',
        error: 'VALIDATION_ERROR',
        details: unknown.map((code) => ({
          field: 'permissions',
          message: `Permission inconnue : ${code}`,
        })),
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: id,
          permissionId: permission.id,
        })),
      });

      // Les permissions étant rechargées à chaque requête, il suffit
      // d'invalider les access tokens des porteurs du rôle pour que le
      // changement s'applique sans délai.
      await tx.user.updateMany({
        where: { roles: { some: { roleId: id } } },
        data: { tokenVersion: { increment: 1 } },
      });

      await this.audit.recordInTransaction(tx, {
        userId: actor.id,
        action: AuditAction.UPDATE,
        entity: 'Role',
        entityId: id,
        metadata: { permissions: dto.permissions },
      });
    });

    return this.findOne(id);
  }

  /** Catalogue complet des permissions, groupées par ressource. */
  async listPermissions() {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
      select: {
        id: true,
        code: true,
        resource: true,
        action: true,
        description: true,
      },
    });

    const grouped = new Map<string, typeof permissions>();

    for (const permission of permissions) {
      const bucket = grouped.get(permission.resource) ?? [];
      bucket.push(permission);
      grouped.set(permission.resource, bucket);
    }

    return [...grouped.entries()].map(([resource, items]) => ({
      resource,
      permissions: items,
    }));
  }
}
