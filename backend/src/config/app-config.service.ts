import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.validation';

/**
 * Accès typé à la configuration validée.
 *
 * Les modules n'appellent jamais `process.env` directement : toute lecture passe
 * ici, ce qui garantit que la valeur a traversé la validation de démarrage.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  // --- Application ---------------------------------------------------------
  get nodeEnv() {
    return this.get('NODE_ENV');
  }
  get isProduction() {
    return this.nodeEnv === 'production';
  }
  get isDevelopment() {
    return this.nodeEnv === 'development';
  }
  get isTest() {
    return this.nodeEnv === 'test';
  }
  get port() {
    return this.get('PORT');
  }
  get apiPrefix() {
    return this.get('API_PREFIX');
  }
  get appName() {
    return this.get('APP_NAME');
  }
  get frontendUrl() {
    return this.get('FRONTEND_URL').replace(/\/+$/, '');
  }

  // --- Sécurité ------------------------------------------------------------
  get corsOrigins(): string[] {
    return this.get('CORS_ORIGINS')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
  get throttle() {
    return {
      ttl: this.get('THROTTLE_TTL'),
      limit: this.get('THROTTLE_LIMIT'),
      authTtl: this.get('AUTH_THROTTLE_TTL'),
      authLimit: this.get('AUTH_THROTTLE_LIMIT'),
    };
  }
  get maxLoginAttempts() {
    return this.get('MAX_LOGIN_ATTEMPTS');
  }
  get lockoutMinutes() {
    return this.get('LOCKOUT_MINUTES');
  }
  get cookieSecure() {
    return this.get('COOKIE_SECURE');
  }
  get cookieDomain() {
    return this.get('COOKIE_DOMAIN') || undefined;
  }

  // --- JWT -----------------------------------------------------------------
  get jwt() {
    return {
      accessSecret: this.get('JWT_ACCESS_SECRET'),
      accessExpiresIn: this.get('JWT_ACCESS_EXPIRES_IN'),
      refreshSecret: this.get('JWT_REFRESH_SECRET'),
      refreshExpiresIn: this.get('JWT_REFRESH_EXPIRES_IN'),
    };
  }

  // --- Stockage objet ------------------------------------------------------
  get storage() {
    return {
      endpoint: this.get('S3_ENDPOINT'),
      region: this.get('S3_REGION'),
      bucket: this.get('S3_BUCKET'),
      accessKey: this.get('S3_ACCESS_KEY'),
      secretKey: this.get('S3_SECRET_KEY'),
      forcePathStyle: this.get('S3_FORCE_PATH_STYLE'),
      signedUrlTtl: this.get('S3_SIGNED_URL_TTL'),
    };
  }

  // --- Upload --------------------------------------------------------------
  get maxFileSizeBytes() {
    return this.get('MAX_FILE_SIZE_MB') * 1024 * 1024;
  }
  get maxGeoFileSizeBytes() {
    return this.get('MAX_GEO_FILE_SIZE_MB') * 1024 * 1024;
  }

  // --- Email ---------------------------------------------------------------
  get mail() {
    const user = this.get('SMTP_USER');
    const password = this.get('SMTP_PASSWORD');

    return {
      host: this.get('SMTP_HOST'),
      port: this.get('SMTP_PORT'),
      secure: this.get('SMTP_SECURE'),
      auth: user && password ? { user, pass: password } : undefined,
      fromName: this.get('MAIL_FROM_NAME'),
      fromAddress: this.get('MAIL_FROM_ADDRESS'),
    };
  }

  // --- Métier --------------------------------------------------------------
  get shareDefaultDays() {
    return this.get('SHARE_DEFAULT_DAYS');
  }
  get shareExpiryWarningDays() {
    return this.get('SHARE_EXPIRY_WARNING_DAYS');
  }
  get permitExpiryWarningDays() {
    return this.get('PERMIT_EXPIRY_WARNING_DAYS');
  }
}
