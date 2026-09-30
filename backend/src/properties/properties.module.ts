import { Module } from '@nestjs/common';
import { SitesModule } from '../sites/sites.module';
import { PropertiesController } from './properties.controller';
import { PropertiesRepository } from './properties.repository';
import { PropertiesService } from './properties.service';

@Module({
  // Le quartier d'un bien peut être saisi dans sa fiche : sa résolution
  // appartient au service des sites.
  imports: [SitesModule],
  controllers: [PropertiesController],
  providers: [PropertiesService, PropertiesRepository],
  exports: [PropertiesService, PropertiesRepository],
})
export class PropertiesModule {}
