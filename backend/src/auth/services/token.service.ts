import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { generateSecureToken, hashToken } from '../../common/utils/crypto.util';
import {
  addMs,
  parseDurationToMs,
  parseDurationToSeconds,
} from '../../common/utils/duration.util';
import type { PermissionCode, RoleCode } from '../../common/constants/rbac.constants';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: RoleCode[];
  permissions: PermissionCode[];
  tokenVersion: number;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresAt: Date;
}

export interface TokenContext {
  ip?: string;
  userAgent?: string;
}

/**
 * Émission et rotation des tokens (§8).
 *
 * - Access token : JWT court, autoporteur, vérifié à chaque requête.
 * - Refresh token : **opaque** (256 bits aléatoires), stocké haché en base.
 *   Un JWT de refresh serait invalidable seulement à son expiration ; un token
 *   opaque se révoque immédiatement en base, ce qui est indispensable pour
 *   couper l'accès d'un bénéficiaire dès la révocation d'un partage (§21).
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  get accessTokenTtlSeconds(): number {
    return parseDurationToSeconds(this.config.jwt.accessExpiresIn);
  }

  get refreshTokenTtlMs(): number {
    return parseDurationToMs(this.config.jwt.refreshExpiresIn);
  }

  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.jwt.accessSecret,
      expiresIn: this.config.jwt.accessExpiresIn,
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwt.verify<AccessTokenPayload>(token, {
      secret: this.config.jwt.accessSecret,
    });
  }

  /**
   * Émet un couple access + refresh.
   *
   * `familyId` relie les rotations successives d'une même session : si un token
   * déjà consommé réapparaît, toute la famille est révoquée.
   */
  async issueTokens(
    payload: AccessTokenPayload,
    context: TokenContext = {},
    familyId: string = randomUUID(),
  ): Promise<IssuedTokens> {
    const refreshToken = generateSecureToken(32);
    const refreshExpiresAt = addMs(new Date(), this.refreshTokenTtlMs);

    await this.prisma.refreshToken.create({
      data: {
        userId: payload.sub,
        tokenHash: hashToken(refreshToken),
        familyId,
        expiresAt: refreshExpiresAt,
        ip: context.ip,
        userAgent: context.userAgent?.slice(0, 500),
      },
    });

    return {
      accessToken: this.signAccessToken(payload),
      refreshToken,
      expiresIn: this.accessTokenTtlSeconds,
      refreshExpiresAt,
    };
  }

  /**
   * Valide un refresh token et le remplace par un nouveau (rotation).
   *
   * Trois cas d'échec, tous traités en `401` sans détail :
   *  - token inconnu ou expiré ;
   *  - token déjà révoqué → **réutilisation** : la famille entière est coupée,
   *    car cela signale une copie volée du token ;
   *  - utilisateur désactivé ou supprimé.
   */
  async rotateRefreshToken(
    plainToken: string,
    buildPayload: (userId: string) => Promise<AccessTokenPayload>,
    context: TokenContext = {},
  ): Promise<IssuedTokens> {
    const tokenHash = hashToken(plainToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, isActive: true, deletedAt: true } } },
    });

    if (!stored) {
      throw new UnauthorizedException({
        message: 'Session invalide, veuillez vous reconnecter.',
        error: 'UNAUTHORIZED',
      });
    }

    if (stored.revokedAt) {
      this.logger.warn(
        `Réutilisation d'un refresh token révoqué (famille ${stored.familyId}) : révocation de la famille.`,
      );
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException({
        message: 'Session invalide, veuillez vous reconnecter.',
        error: 'UNAUTHORIZED',
      });
    }

    if (stored.expiresAt <= new Date()) {
      throw new UnauthorizedException({
        message: 'Session expirée, veuillez vous reconnecter.',
        error: 'UNAUTHORIZED',
      });
    }

    if (!stored.user || !stored.user.isActive || stored.user.deletedAt) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException({
        message: 'Compte indisponible.',
        error: 'UNAUTHORIZED',
      });
    }

    const payload = await buildPayload(stored.userId);
    const refreshToken = generateSecureToken(32);
    const refreshExpiresAt = addMs(new Date(), this.refreshTokenTtlMs);

    // Révocation de l'ancien et création du nouveau dans la même transaction :
    // impossible de se retrouver avec deux tokens valides pour une session.
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          userId: stored.userId,
          tokenHash: hashToken(refreshToken),
          familyId: stored.familyId,
          expiresAt: refreshExpiresAt,
          ip: context.ip,
          userAgent: context.userAgent?.slice(0, 500),
        },
      });

      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date(), replacedById: created.id },
      });
    });

    return {
      accessToken: this.signAccessToken(payload),
      refreshToken,
      expiresIn: this.accessTokenTtlSeconds,
      refreshExpiresAt,
    };
  }

  /** Révoque la session correspondant à ce token (déconnexion). */
  async revokeByToken(plainToken: string): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(plainToken) },
      select: { familyId: true },
    });

    if (stored) {
      await this.revokeFamily(stored.familyId);
    }
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Coupe toutes les sessions d'un utilisateur (révocation, désactivation). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Purge des tokens révoqués ou expirés depuis plus de `days` jours. */
  async purgeExpired(days = 30): Promise<number> {
    const threshold = new Date(Date.now() - days * 86_400_000);

    const { count } = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: threshold } },
          { revokedAt: { lt: threshold } },
        ],
      },
    });

    return count;
  }
}
