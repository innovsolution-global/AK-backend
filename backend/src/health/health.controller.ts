import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@ApiTags('Santé')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: "État de l'API et de ses dépendances",
    description:
      "La base est la seule dépendance critique : sans elle le statut est `down`. Stockage et SMTP indisponibles dégradent le service sans l'interrompre.",
  })
  async check() {
    const [database, storage, mail] = await Promise.all([
      this.checkDatabase(),
      this.storage.isAvailable(),
      this.mail.verifyConnection(),
    ]);

    return {
      status: !database ? 'down' : storage && mail ? 'ok' : 'degraded',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      dependencies: {
        database: database ? 'up' : 'down',
        storage: storage ? 'up' : 'down',
        mail: mail ? 'up' : 'down',
      },
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
