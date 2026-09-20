import {
  INestApplication,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/** Modèles portant un soft delete (`deletedAt` / `deletedById`). */
export const SOFT_DELETE_MODELS = [
  'User',
  'Location',
  'Site',
  'Property',
  'PropertyDocument',
  'PropertyGeoFile',
  'Company',
  'Project',
  'ProjectComponent',
  'ProjectDocument',
  'BuildingPermit',
] as const;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
      errorFormat: 'minimal',
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connexion PostgreSQL établie');

    if (process.env.NODE_ENV === 'development') {
      // Journalise les requêtes lentes pour repérer les index manquants (§38).
      (this as unknown as { $on: (e: string, cb: (p: Prisma.QueryEvent) => void) => void }).$on(
        'query',
        (event: Prisma.QueryEvent) => {
          if (event.duration > 200) {
            this.logger.warn(
              `Requête lente (${event.duration} ms) : ${event.query}`,
            );
          }
        },
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Ferme proprement la connexion lors d'un arrêt du processus. */
  enableShutdownHooks(app: INestApplication): void {
    process.on('beforeExit', () => {
      void app.close();
    });
  }

  /**
   * Vide toutes les tables — réservé aux tests d'intégration.
   * Refuse de s'exécuter hors environnement de test.
   */
  async truncateAll(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error(
        'truncateAll() est réservé à NODE_ENV=test : opération refusée.',
      );
    }

    const tables = await this.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
    `;

    const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
    if (list.length > 0) {
      await this.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE;`);
    }
  }
}
