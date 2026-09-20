import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, TokenPurpose } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/services/password.service';
import { TokenService } from '../auth/services/token.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResult } from '../common/dto/paginated-result';
import { ROLES, type RoleCode } from '../common/constants/rbac.constants';
import { generateSecureToken, hashToken } from '../common/utils/crypto.util';
import { addMs } from '../common/utils/duration.util';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import {
  type CreateUserDto,
  type QueryUsersDto,
  type UpdateUserDto,
  type UserResponseDto,
} from './dto/user.dto';
import { UsersRepository, type UserRecord } from './users.repository';

const ACTIVATION_TTL_MS = 48 * 3_600_000;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: QueryUsersDto): Promise<PaginatedResult<UserResponseDto>> {
    const [users, total] = await this.repository.findPage(query);

    return PaginatedResult.from(users.map(toResponse), total, query);
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.repository.findById(id);

    if (!user) {
      throw new NotFoundException({
        message: "Cet utilisateur n'existe pas.",
        error: 'NOT_FOUND',
      });
    }

    return toResponse(user);
  }

  /**
   * Crée un compte.
   *
   * Sans mot de passe fourni, le compte est créé **inactif** et un lien
   * d'activation est envoyé : le bénéficiaire choisit lui-même son mot de passe,
   * qui ne transite donc jamais par un tiers (§21).
   */
  async create(
    dto: CreateUserDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<UserResponseDto> {
    const existing = await this.repository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException({
        message: 'Cette adresse email est déjà utilisée.',
        error: 'CONFLICT',
        details: [{ field: 'email', message: 'Adresse déjà utilisée' }],
      });
    }

    const roles = await this.resolveRoles(dto.roles);
    const selfService = !dto.password;

    // Un compte sans mot de passe reçoit un hash d'un secret aléatoire jamais
    // communiqué : la colonne reste non nulle et aucun mot de passe connu ne
    // permet de s'y connecter avant l'activation.
    const passwordHash = await this.passwords.hash(
      dto.password ?? generateSecureToken(32),
    );

    const activationToken = selfService ? generateSecureToken(32) : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          passwordHash,
          isActive: !selfService,
          roles: {
            create: roles.map((role) => ({
              roleId: role.id,
              assignedById: actor.id,
            })),
          },
        },
        select: { id: true },
      });

      if (activationToken) {
        await tx.temporaryAccessToken.create({
          data: {
            userId: user.id,
            purpose: TokenPurpose.PASSWORD_RESET,
            tokenHash: hashToken(activationToken),
            expiresAt: addMs(new Date(), ACTIVATION_TTL_MS),
            metadata: { reason: 'ACCOUNT_ACTIVATION' },
          },
        });
      }

      await this.audit.recordInTransaction(tx, {
        userId: actor.id,
        action: AuditAction.CREATE,
        entity: 'User',
        entityId: user.id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { email: dto.email, roles: dto.roles },
      });

      return user;
    });

    if (activationToken) {
      await this.mail.sendPasswordReset({
        to: dto.email,
        firstName: dto.firstName,
        token: activationToken,
        expiresInMinutes: ACTIVATION_TTL_MS / 60_000,
      });
    }

    return this.findOne(created.id);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<UserResponseDto> {
    const user = await this.repository.findById(id);
    if (!user) {
      throw new NotFoundException({
        message: "Cet utilisateur n'existe pas.",
        error: 'NOT_FOUND',
      });
    }

    if (dto.roles) {
      await this.assertNotLastAdmin(user, dto.roles, 'rétrograder');
    }

    const roles = dto.roles ? await this.resolveRoles(dto.roles) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
        },
      });

      if (roles) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: roles.map((role) => ({
            userId: id,
            roleId: role.id,
            assignedById: actor.id,
          })),
        });

        // Les permissions changent : les access tokens déjà émis doivent cesser
        // d'être acceptés, sans attendre leur expiration.
        await tx.user.update({
          where: { id },
          data: { tokenVersion: { increment: 1 } },
        });
      }

      await this.audit.recordInTransaction(tx, {
        userId: actor.id,
        action: AuditAction.UPDATE,
        entity: 'User',
        entityId: id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { roles: dto.roles },
      });
    });

    return this.findOne(id);
  }

  /** Soft delete : la ligne est conservée pour l'historique et l'audit (§30). */
  async remove(
    id: string,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<void> {
    if (id === actor.id) {
      throw new BadRequestException({
        message: 'Vous ne pouvez pas supprimer votre propre compte.',
        error: 'VALIDATION_ERROR',
      });
    }

    const user = await this.repository.findById(id);
    if (!user) {
      throw new NotFoundException({
        message: "Cet utilisateur n'existe pas.",
        error: 'NOT_FOUND',
      });
    }

    await this.assertNotLastAdmin(user, [], 'supprimer');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedById: actor.id,
          isActive: false,
          tokenVersion: { increment: 1 },
        },
      });

      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.audit.recordInTransaction(tx, {
        userId: actor.id,
        action: AuditAction.DELETE,
        entity: 'User',
        entityId: id,
        ip: context.ip,
        userAgent: context.userAgent,
      });
    });
  }

  async setActive(
    id: string,
    isActive: boolean,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<UserResponseDto> {
    if (id === actor.id && !isActive) {
      throw new BadRequestException({
        message: 'Vous ne pouvez pas désactiver votre propre compte.',
        error: 'VALIDATION_ERROR',
      });
    }

    const user = await this.repository.findById(id);
    if (!user) {
      throw new NotFoundException({
        message: "Cet utilisateur n'existe pas.",
        error: 'NOT_FOUND',
      });
    }

    if (!isActive) {
      await this.assertNotLastAdmin(user, [], 'désactiver');
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        isActive,
        // Réactiver un compte remet le compteur de tentatives à zéro : le
        // verrouillage anti-brute-force ne doit pas survivre à la réactivation.
        failedLoginAttempts: 0,
        lockedUntil: null,
        ...(isActive ? {} : { tokenVersion: { increment: 1 } }),
      },
    });

    if (!isActive) {
      await this.tokens.revokeAllForUser(id);
    }

    await this.audit.record({
      userId: actor.id,
      action: AuditAction.UPDATE,
      entity: 'User',
      entityId: id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { isActive },
    });

    return this.findOne(id);
  }

  // --- Règles internes ------------------------------------------------------

  private async resolveRoles(codes: RoleCode[]) {
    const unique = [...new Set(codes)];

    if (unique.length === 0) {
      throw new BadRequestException({
        message: 'Au moins un rôle doit être attribué.',
        error: 'VALIDATION_ERROR',
        details: [{ field: 'roles', message: 'Au moins un rôle est requis' }],
      });
    }

    const roles = await this.repository.findRoleIdsByCodes(unique);

    if (roles.length !== unique.length) {
      const found = new Set(roles.map((role) => role.code));
      const missing = unique.filter((code) => !found.has(code));

      throw new BadRequestException({
        message: 'Un ou plusieurs rôles sont inconnus.',
        error: 'VALIDATION_ERROR',
        details: missing.map((code) => ({
          field: 'roles',
          message: `Rôle inconnu : ${code}`,
        })),
      });
    }

    return roles;
  }

  /**
   * Empêche de perdre le dernier administrateur actif : sans lui, plus personne
   * ne peut gérer les utilisateurs ni les rôles.
   */
  private async assertNotLastAdmin(
    user: UserRecord,
    nextRoles: RoleCode[],
    action: string,
  ): Promise<void> {
    const isAdmin = user.roles.some(({ role }) => role.code === ROLES.ADMIN);
    const staysAdmin = nextRoles.includes(ROLES.ADMIN);

    if (!isAdmin || staysAdmin) return;

    const remaining = await this.repository.countActiveAdmins(user.id);

    if (remaining === 0) {
      throw new BadRequestException({
        message: `Impossible de ${action} le dernier administrateur actif.`,
        error: 'VALIDATION_ERROR',
      });
    }
  }
}

function toResponse(user: UserRecord): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    isActive: user.isActive,
    emailVerifiedAt: user.emailVerifiedAt,
    lastLoginAt: user.lastLoginAt,
    roles: user.roles.map(({ role }) => role.code),
    createdAt: user.createdAt,
  };
}
