import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { AppConfigService } from '../config/app-config.service';
import {
  emailVerificationTemplate,
  passwordResetTemplate,
} from './mail.templates';
import {
  shareExpiringTemplate,
  shareInvitationTemplate,
  shareRevokedTemplate,
} from './share.templates';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter!: Transporter;

  constructor(private readonly config: AppConfigService) {}

  onModuleInit(): void {
    const { host, port, secure, auth } = this.config.mail;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth,
      // Mailpit et MinIO en développement utilisent des certificats auto-signés.
      tls: { rejectUnauthorized: this.config.isProduction },
    });
  }

  /**
   * Envoie un message.
   *
   * Un échec d'envoi ne doit pas faire échouer l'action métier qui l'a déclenché
   * (créer un partage, réinitialiser un mot de passe) : il est journalisé et la
   * méthode renvoie `false`. Les routes qui en dépendent restent idempotentes et
   * peuvent être rejouées (`/shares/:id/resend`).
   */
  async send(message: MailMessage): Promise<boolean> {
    const { fromName, fromAddress } = this.config.mail;

    try {
      const info = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });

      this.logger.log(`Email envoyé à ${message.to} (${info.messageId})`);
      return true;
    } catch (error) {
      this.logger.error(
        `Échec d'envoi à ${message.to} : ${(error as Error).message}`,
      );
      return false;
    }
  }

  async sendPasswordReset(params: {
    to: string;
    firstName: string;
    token: string;
    expiresInMinutes: number;
  }): Promise<boolean> {
    const url = `${this.config.frontendUrl}/reset-password?token=${encodeURIComponent(
      params.token,
    )}`;

    const template = passwordResetTemplate({
      appName: this.config.appName,
      firstName: params.firstName,
      url,
      expiresInMinutes: params.expiresInMinutes,
    });

    return this.send({ to: params.to, ...template });
  }

  async sendEmailVerification(params: {
    to: string;
    firstName: string;
    token: string;
  }): Promise<boolean> {
    const url = `${this.config.frontendUrl}/verify-email?token=${encodeURIComponent(
      params.token,
    )}`;

    const template = emailVerificationTemplate({
      appName: this.config.appName,
      firstName: params.firstName,
      url,
    });

    return this.send({ to: params.to, ...template });
  }

  /** Invitation à un partage sécurisé (§20). */
  async sendShareInvitation(params: {
    to: string;
    firstName: string;
    senderName: string;
    propertyName: string;
    propertyReference: string;
    message?: string | null;
    token: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const url = `${this.config.frontendUrl}/activate-share?token=${encodeURIComponent(
      params.token,
    )}`;

    const template = shareInvitationTemplate({
      appName: this.config.appName,
      firstName: params.firstName,
      senderName: params.senderName,
      propertyName: params.propertyName,
      propertyReference: params.propertyReference,
      message: params.message,
      url,
      expiresAt: params.expiresAt,
    });

    return this.send({ to: params.to, ...template });
  }

  /** Notification de révocation d'un partage (§21). */
  async sendShareRevoked(params: {
    to: string;
    firstName: string;
    propertyReference: string;
  }): Promise<boolean> {
    const template = shareRevokedTemplate({
      appName: this.config.appName,
      firstName: params.firstName,
      propertyReference: params.propertyReference,
    });

    return this.send({ to: params.to, ...template });
  }

  /** Alerte d'expiration prochaine d'un partage (§27). */
  async sendShareExpiring(params: {
    to: string;
    firstName: string;
    propertyReference: string;
    expiresAt: Date;
    daysLeft: number;
  }): Promise<boolean> {
    const template = shareExpiringTemplate({
      appName: this.config.appName,
      firstName: params.firstName,
      propertyReference: params.propertyReference,
      expiresAt: params.expiresAt,
      daysLeft: params.daysLeft,
    });

    return this.send({ to: params.to, ...template });
  }

  /** Vérifie la connexion SMTP — exposé par `/api/health`. */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }
}
