import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/constants/rbac.constants';
import { IdParamDto } from '../common/dto/id-param.dto';
import { UuidParam } from '../common/pipes/uuid-param.pipe';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import {
  ChangeProjectStatusDto,
  CreateComponentDto,
  CreateProjectDto,
  QueryProjectsDto,
  UpdateComponentDto,
  UpdateProjectDto,
} from './dto/project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('Projets')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'Liste paginée des projets' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryProjectsDto,
  ) {
    return this.projects.findAll(user, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: "Fiche d'un projet" })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param() params: IdParamDto) {
    return this.projects.findOne(user, params.id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PROJECT_CREATE)
  @ApiOperation({
    summary: "Création d'un projet",
    description:
      "La référence AK-PRJ-XXXXXX est générée automatiquement et l'historique de statut est initialisé.",
  })
  create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.projects.create(dto, actor, contextOf(request));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PROJECT_UPDATE)
  @ApiOperation({
    summary: "Modification d'un projet",
    description:
      'Le statut ne se modifie pas ici : utiliser POST /projects/:id/status pour conserver la traçabilité.',
  })
  update(
    @Param() params: IdParamDto,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.projects.update(params.id, dto, actor, contextOf(request));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PROJECT_DELETE)
  @ApiOperation({ summary: "Suppression logique d'un projet" })
  remove(
    @Param() params: IdParamDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.projects.remove(params.id, actor, contextOf(request));
  }

  // --- Statut ---------------------------------------------------------------

  @Post(':id/status')
  @RequirePermissions(PERMISSIONS.PROJECT_UPDATE)
  @ApiOperation({
    summary: 'Évolution du statut',
    description:
      "Le changement et l'écriture de l'historique sont atomiques. Les transitions incohérentes sont refusées.",
  })
  changeStatus(
    @Param() params: IdParamDto,
    @Body() dto: ChangeProjectStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.projects.changeStatus(params.id, dto, actor, contextOf(request));
  }

  @Get(':id/status-history')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({
    summary: 'Historique des statuts',
    description: "L'historique est append-only : il n'est jamais écrasé (§18).",
  })
  statusHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamDto,
  ) {
    return this.projects.getStatusHistory(user, params.id);
  }

  // --- Composantes ----------------------------------------------------------

  @Post(':id/components')
  @RequirePermissions(PERMISSIONS.PROJECT_UPDATE)
  @ApiOperation({ summary: "Ajout d'une composante" })
  addComponent(
    @Param() params: IdParamDto,
    @Body() dto: CreateComponentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.projects.addComponent(params.id, dto, actor, contextOf(request));
  }

  @Patch(':id/components/:componentId')
  @RequirePermissions(PERMISSIONS.PROJECT_UPDATE)
  @ApiParam({ name: 'componentId', format: 'uuid' })
  @ApiOperation({ summary: "Modification d'une composante" })
  updateComponent(
    @Param('id', UuidParam) id: string,
    @Param('componentId', UuidParam) componentId: string,
    @Body() dto: UpdateComponentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.projects.updateComponent(
      id,
      componentId,
      dto,
      actor,
      contextOf(request),
    );
  }

  @Delete(':id/components/:componentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PROJECT_UPDATE)
  @ApiParam({ name: 'componentId', format: 'uuid' })
  @ApiOperation({ summary: "Suppression d'une composante" })
  removeComponent(
    @Param('id', UuidParam) id: string,
    @Param('componentId', UuidParam) componentId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.projects.removeComponent(
      id,
      componentId,
      actor,
      contextOf(request),
    );
  }
}

function contextOf(request: Request): RequestContext {
  return {
    ip: request.ip,
    userAgent: request.get('user-agent') ?? undefined,
  };
}
