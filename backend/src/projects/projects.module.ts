import { Module } from '@nestjs/common';
import { SitesModule } from '../sites/sites.module';
import { BuildingPermitsController } from '../building-permits/building-permits.controller';
import { BuildingPermitsService } from '../building-permits/building-permits.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  // Le quartier d'un projet peut être saisi dans sa fiche.
  imports: [SitesModule],
  controllers: [ProjectsController, BuildingPermitsController],
  providers: [ProjectsService, BuildingPermitsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
