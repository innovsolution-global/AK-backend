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
  CreateBuildingPermitDto,
  UpdateBuildingPermitDto,
} from './dto/building-permit.dto';
import { BuildingPermitsService } from './building-permits.service';

@ApiTags('Projets')
@ApiBearerAuth()
@Controller('projects/:id/permits')
export class BuildingPermitsController {
  constructor(private readonly permits: BuildingPermitsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: "Permis de construire d'un projet" })
  findAll(@CurrentUser() user: AuthenticatedUser, @Param() params: IdParamDto) {
    return this.permits.findAll(user, params.id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PROJECT_UPDATE)
  @ApiOperation({ summary: "Enregistrement d'un permis" })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamDto,
    @Body() dto: CreateBuildingPermitDto,
    @Req() request: Request,
  ) {
    return this.permits.create(user, params.id, dto, contextOf(request));
  }

  @Patch(':permitId')
  @RequirePermissions(PERMISSIONS.PROJECT_UPDATE)
  @ApiParam({ name: 'permitId', format: 'uuid' })
  @ApiOperation({ summary: "Modification d'un permis" })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParam) id: string,
    @Param('permitId', UuidParam) permitId: string,
    @Body() dto: UpdateBuildingPermitDto,
    @Req() request: Request,
  ) {
    return this.permits.update(user, id, permitId, dto, contextOf(request));
  }

  @Delete(':permitId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PROJECT_UPDATE)
  @ApiParam({ name: 'permitId', format: 'uuid' })
  @ApiOperation({ summary: "Suppression d'un permis" })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParam) id: string,
    @Param('permitId', UuidParam) permitId: string,
    @Req() request: Request,
  ) {
    return this.permits.remove(user, id, permitId, contextOf(request));
  }
}

function contextOf(request: Request): RequestContext {
  return {
    ip: request.ip,
    userAgent: request.get('user-agent') ?? undefined,
  };
}
