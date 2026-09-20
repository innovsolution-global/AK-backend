import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  PermissionCode,
  RoleCode,
} from '../../common/constants/rbac.constants';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { AccessTokenPayload } from './token.service';

/**
 * Construit le contexte d'accès d'un utilisateur à partir de la base.
 *
 * Les rôles et permissions sont **rechargés à chaque requête** plutôt que lus
 * dans le JWT : retirer un rôle ou révoquer un partage prend alors effet
 * immédiatement, sans attendre l'expiration de l'access token.
 */
@Injectable()
export class AuthContextService {
  constructor(private readonly prisma: PrismaService) {}

  /** Charge le contexte, ou lève `401` si le compte n'est plus utilisable. */
  async loadForUser(userId: string, tokenVersion?: number): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        mustChangePassword: true,
        tokenVersion: true,
        lockedUntil: true,
        roles: {
          select: {
            role: {
              select: {
                code: true,
                permissions: { select: { permission: { select: { code: true } } } },
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        message: 'Compte indisponible.',
        error: 'UNAUTHORIZED',
      });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException({
        message: 'Compte temporairement verrouillé.',
        error: 'UNAUTHORIZED',
      });
    }

    // Une incrémentation de tokenVersion invalide tous les JWT déjà émis :
    // c'est le levier de déconnexion immédiate (révocation, changement de mot
    // de passe, désactivation).
    if (tokenVersion !== undefined && tokenVersion !== user.tokenVersion) {
      throw new UnauthorizedException({
        message: 'Session invalide, veuillez vous reconnecter.',
        error: 'UNAUTHORIZED',
      });
    }

    return this.toAuthenticatedUser(user);
  }

  /** Charge le contexte puis en dérive la charge utile du JWT. */
  async buildAccessPayload(userId: string): Promise<AccessTokenPayload> {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, tokenVersion: true },
    });

    const context = await this.loadForUser(userId);

    return {
      sub: user.id,
      email: user.email,
      roles: context.roles,
      permissions: context.permissions,
      tokenVersion: user.tokenVersion,
    };
  }

  private toAuthenticatedUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    mustChangePassword: boolean;
    roles: Array<{
      role: { code: string; permissions: Array<{ permission: { code: string } }> };
    }>;
  }): AuthenticatedUser {
    const roles = user.roles.map(({ role }) => role.code as RoleCode);

    // Un même code de permission peut venir de plusieurs rôles cumulés.
    const permissions = [
      ...new Set(
        user.roles.flatMap(({ role }) =>
          role.permissions.map(({ permission }) => permission.code as PermissionCode),
        ),
      ),
    ];

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      mustChangePassword: user.mustChangePassword,
      roles,
      permissions,
    };
  }
}
