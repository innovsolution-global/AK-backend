import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditAction, TokenPurpose } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { generateSecureToken, hashToken } from '../common/utils/crypto.util';
import { addMs } from '../common/utils/duration.util';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { AuthContextService } from './services/auth-context.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthenticatedUser;
}

/** Durée de validité d'un lien de réinitialisation. */
const PASSWORD_RESET_TTL_MINUTES = 30;
const EMAIL_VERIFICATION_TTL_MS = 24 * 3_600_000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly authContext: AuthContextService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  // -------------------------------------------------------------------------
  // Connexion
  // -------------------------------------------------------------------------

  /**
   * Authentifie un utilisateur.
   *
   * Toutes les causes d'échec renvoient le **même** message : un message
   * différencié (« email inconnu » vs « mot de passe incorrect ») permettrait
   * d'énumérer les comptes existants.
   */
  async login(dto: LoginDto, context: RequestContext): Promise<LoginResult> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        isActive: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });

    if (!user) {
      // Consomme le même temps qu'une vérification réelle (anti-énumération).
      await this.passwords.fakeVerify();
      throw this.invalidCredentials();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60_000,
      );
      throw new UnauthorizedException({
        message: `Compte temporairement verrouillé. Réessayez dans ${minutes} minute(s).`,
        error: 'UNAUTHORIZED',
      });
    }

    const passwordMatches = await this.passwords.verify(
      user.passwordHash,
      dto.password,
    );

    if (!passwordMatches) {
      await this.registerFailedAttempt(user.id, user.failedLoginAttempts, context);
      throw this.invalidCredentials();
    }

    if (!user.isActive) {
      throw new UnauthorizedException({
        message: 'Ce compte est désactivé. Contactez un administrateur.',
        error: 'UNAUTHORIZED',
      });
    }

    // Met à niveau le hash si les paramètres Argon2 ont évolué depuis la
    // dernière connexion — transparent pour l'utilisateur.
    if (this.passwords.needsRehash(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await this.passwords.hash(dto.password) },
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const payload = await this.authContext.buildAccessPayload(user.id);
    const issued = await this.tokens.issueTokens(payload, context);
    const authenticated = await this.authContext.loadForUser(user.id);

    await this.audit.record({
      userId: user.id,
      action: AuditAction.LOGIN,
      entity: 'User',
      entityId: user.id,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return {
      accessToken: issued.accessToken,
      expiresIn: issued.expiresIn,
      refreshToken: issued.refreshToken,
      refreshExpiresAt: issued.refreshExpiresAt,
      user: authenticated,
    };
  }

  /**
   * Incrémente le compteur d'échecs et verrouille le compte au seuil configuré
   * (§8 — protection contre le brute-force).
   */
  private async registerFailedAttempt(
    userId: string,
    currentAttempts: number,
    context: RequestContext,
  ): Promise<void> {
    const attempts = currentAttempts + 1;
    const reachedLimit = attempts >= this.config.maxLoginAttempts;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: reachedLimit
          ? addMs(new Date(), this.config.lockoutMinutes * 60_000)
          : null,
      },
    });

    if (reachedLimit) {
      this.logger.warn(
        `Compte ${userId} verrouillé après ${attempts} tentatives échouées (IP ${context.ip ?? 'inconnue'}).`,
      );
      await this.audit.record({
        userId,
        action: AuditAction.LOGIN,
        entity: 'User',
        entityId: userId,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { result: 'LOCKED', attempts },
      });
    }
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      message: 'Identifiants invalides.',
      error: 'UNAUTHORIZED',
    });
  }

  // -------------------------------------------------------------------------
  // Session
  // -------------------------------------------------------------------------

  async refresh(refreshToken: string, context: RequestContext) {
    return this.tokens.rotateRefreshToken(
      refreshToken,
      (userId) => this.authContext.buildAccessPayload(userId),
      context,
    );
  }

  async logout(
    userId: string | undefined,
    refreshToken: string | undefined,
    context: RequestContext,
  ): Promise<void> {
    if (refreshToken) {
      await this.tokens.revokeByToken(refreshToken);
    } else if (userId) {
      await this.tokens.revokeAllForUser(userId);
    }

    if (userId) {
      await this.audit.record({
        userId,
        action: AuditAction.LOGOUT,
        entity: 'User',
        entityId: userId,
        ip: context.ip,
        userAgent: context.userAgent,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Mots de passe
  // -------------------------------------------------------------------------

  /**
   * Demande de réinitialisation.
   *
   * Renvoie toujours un succès, que l'adresse existe ou non : la réponse ne doit
   * pas permettre de savoir si un compte est enregistré.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null, isActive: true },
      select: { id: true, email: true, firstName: true },
    });

    if (!user) {
      this.logger.debug(
        `Demande de réinitialisation pour une adresse inconnue : ${dto.email}`,
      );
      return;
    }

    const token = generateSecureToken(32);

    await this.prisma.$transaction(async (tx) => {
      // Invalide les demandes précédentes encore ouvertes : un seul lien actif.
      await tx.temporaryAccessToken.updateMany({
        where: {
          userId: user.id,
          purpose: TokenPurpose.PASSWORD_RESET,
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });

      await tx.temporaryAccessToken.create({
        data: {
          userId: user.id,
          purpose: TokenPurpose.PASSWORD_RESET,
          tokenHash: hashToken(token),
          expiresAt: addMs(new Date(), PASSWORD_RESET_TTL_MINUTES * 60_000),
        },
      });
    });

    await this.mail.sendPasswordReset({
      to: user.email,
      firstName: user.firstName,
      token,
      expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
    });
  }

  /**
   * Réinitialise le mot de passe via un token à usage unique.
   * Toutes les sessions existantes sont coupées.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const record = await this.prisma.temporaryAccessToken.findUnique({
      where: { tokenHash: hashToken(dto.token) },
      select: { id: true, userId: true, purpose: true, expiresAt: true, usedAt: true },
    });

    if (
      !record ||
      record.purpose !== TokenPurpose.PASSWORD_RESET ||
      record.usedAt ||
      record.expiresAt <= new Date() ||
      !record.userId
    ) {
      throw new BadRequestException({
        message: 'Ce lien est invalide ou a expiré.',
        error: 'VALIDATION_ERROR',
      });
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const userId = record.userId;

    await this.prisma.$transaction(async (tx) => {
      await tx.temporaryAccessToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
          // Invalide les access tokens déjà émis.
          tokenVersion: { increment: 1 },
        },
      });

      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.audit.record({
      userId,
      action: AuditAction.PASSWORD_CHANGE,
      entity: 'User',
      entityId: userId,
      metadata: { method: 'RESET' },
    });
  }

  /**
   * Changement de mot de passe par un utilisateur connecté.
   * Les autres sessions sont révoquées ; celle en cours devra se reconnecter
   * puisque `tokenVersion` change.
   */
  async changePassword(
    user: AuthenticatedUser,
    dto: ChangePasswordDto,
    context: RequestContext,
  ): Promise<void> {
    const record = await this.prisma.user.findFirstOrThrow({
      where: { id: user.id, deletedAt: null },
      select: { passwordHash: true },
    });

    const matches = await this.passwords.verify(
      record.passwordHash,
      dto.currentPassword,
    );

    if (!matches) {
      throw new BadRequestException({
        message: 'Le mot de passe actuel est incorrect.',
        error: 'VALIDATION_ERROR',
        details: [
          { field: 'currentPassword', message: 'Mot de passe incorrect' },
        ],
      });
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException({
        message: "Le nouveau mot de passe doit différer de l'ancien.",
        error: 'VALIDATION_ERROR',
        details: [
          { field: 'newPassword', message: "Doit différer du mot de passe actuel" },
        ],
      });
    }

    const passwordHash = await this.passwords.hash(dto.newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: false,
          tokenVersion: { increment: 1 },
        },
      });

      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.audit.record({
      userId: user.id,
      action: AuditAction.PASSWORD_CHANGE,
      entity: 'User',
      entityId: user.id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { method: 'SELF_SERVICE' },
    });
  }

  // -------------------------------------------------------------------------
  // Vérification d'email
  // -------------------------------------------------------------------------

  async sendEmailVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, firstName: true, emailVerifiedAt: true },
    });

    if (!user || user.emailVerifiedAt) return;

    const token = generateSecureToken(32);

    await this.prisma.temporaryAccessToken.create({
      data: {
        userId: user.id,
        purpose: TokenPurpose.EMAIL_VERIFICATION,
        tokenHash: hashToken(token),
        expiresAt: addMs(new Date(), EMAIL_VERIFICATION_TTL_MS),
      },
    });

    await this.mail.sendEmailVerification({
      to: user.email,
      firstName: user.firstName,
      token,
    });
  }

  async verifyEmail(token: string): Promise<void> {
    const record = await this.prisma.temporaryAccessToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, userId: true, purpose: true, expiresAt: true, usedAt: true },
    });

    if (
      !record ||
      record.purpose !== TokenPurpose.EMAIL_VERIFICATION ||
      record.usedAt ||
      record.expiresAt <= new Date() ||
      !record.userId
    ) {
      throw new BadRequestException({
        message: 'Ce lien de vérification est invalide ou a expiré.',
        error: 'VALIDATION_ERROR',
      });
    }

    await this.prisma.$transaction([
      this.prisma.temporaryAccessToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);
  }
}
