import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES } from '../common/constants/rbac.constants';
import type { QueryUsersDto } from './dto/user.dto';

/** Projection commune : le hash de mot de passe n'en fait jamais partie. */
export const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  isActive: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
  roles: { select: { role: { select: { code: true, name: true } } } },
} satisfies Prisma.UserSelect;

export type UserRecord = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

const SORTABLE_FIELDS = [
  'createdAt',
  'lastLoginAt',
  'email',
  'lastName',
  'firstName',
] as const;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  buildWhere(query: QueryUsersDto): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = { deletedAt: null };

    if (query.role) {
      where.roles = { some: { role: { code: query.role } } };
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  async findPage(query: QueryUsersDto): Promise<[UserRecord[], number]> {
    const where = this.buildWhere(query);

    return this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: query.buildOrderBy(SORTABLE_FIELDS, 'createdAt'),
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
  }

  findById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: USER_SELECT,
    });
  }

  findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true },
    });
  }

  /**
   * Nombre d'administrateurs actifs.
   * Sert à empêcher la suppression ou la rétrogradation du dernier d'entre eux,
   * qui rendrait la plateforme ingérable.
   */
  countActiveAdmins(excludeUserId?: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        deletedAt: null,
        isActive: true,
        id: excludeUserId ? { not: excludeUserId } : undefined,
        roles: { some: { role: { code: ROLES.ADMIN } } },
      },
    });
  }

  findRoleIdsByCodes(codes: string[]): Promise<Array<{ id: string; code: string }>> {
    return this.prisma.role.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
  }
}
