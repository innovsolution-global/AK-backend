import { z } from 'zod';

/**
 * Schéma de validation des variables d'environnement.
 *
 * Appliqué au démarrage : si une variable requise manque ou est invalide,
 * l'application refuse de démarrer plutôt que d'échouer plus tard en production
 * sur un appel isolé.
 */

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const port = z.coerce.number().int().min(1).max(65535);

/** Un secret trop court affaiblit la signature HS256. */
const secret = z
  .string()
  .min(32, 'doit contenir au moins 32 caractères')
  .refine((value) => !value.startsWith('remplacer_par_'), {
    message: 'la valeur d\'exemple du .env.example doit être remplacée',
  });

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'staging', 'production', 'test'])
    .default('development'),
  PORT: port.default(3000),
  API_PREFIX: z.string().default('api'),

  DATABASE_URL: z.string().url(),

  JWT_ACCESS_SECRET: secret,
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: secret,
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  THROTTLE_TTL: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
  AUTH_THROTTLE_TTL: z.coerce.number().int().positive().default(300),
  AUTH_THROTTLE_LIMIT: z.coerce.number().int().positive().default(10),
  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  COOKIE_SECURE: booleanFromString.default('false'),
  COOKIE_DOMAIN: z.string().optional(),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanFromString.default('true'),
  S3_SIGNED_URL_TTL: z.coerce.number().int().positive().default(300),

  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(50),
  MAX_GEO_FILE_SIZE_MB: z.coerce.number().int().positive().default(25),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: port.default(1025),
  SMTP_SECURE: booleanFromString.default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM_NAME: z.string().default('AK IMMO'),
  MAIL_FROM_ADDRESS: z.string().email(),

  APP_NAME: z.string().default('AK IMMO'),
  FRONTEND_URL: z.string().url(),
  SHARE_DEFAULT_DAYS: z.coerce.number().int().positive().default(30),
  SHARE_EXPIRY_WARNING_DAYS: z.coerce.number().int().positive().default(7),
  PERMIT_EXPIRY_WARNING_DAYS: z.coerce.number().int().positive().default(30),

  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valide `process.env` et renvoie un objet typé.
 * En cas d'échec, lève une erreur listant chaque variable fautive.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')} : ${issue.message}`)
      .join('\n');

    throw new Error(
      `Configuration d'environnement invalide :\n${details}\n` +
        'Comparer le fichier .env avec .env.example.',
    );
  }

  const env = result.data;

  // Les deux secrets JWT doivent être distincts : sinon un refresh token
  // pourrait être présenté comme access token.
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    throw new Error(
      "Configuration d'environnement invalide :\n" +
        '  - JWT_ACCESS_SECRET et JWT_REFRESH_SECRET doivent être différents.',
    );
  }

  if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) {
    throw new Error(
      "Configuration d'environnement invalide :\n" +
        '  - COOKIE_SECURE doit valoir true en production.',
    );
  }

  return env;
}
