import { Module } from '@nestjs/common';
import { BuildingPermitsController } from '../building-permits/building-permits.controller';
import { BuildingPermitsService } from '../building-permits/building-permits.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [ProjectsController, BuildingPermitsController],
  providers: [ProjectsService, BuildingPermitsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
