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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/constants/rbac.constants';
import { IdParamDto } from '../common/dto/id-param.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import { CreateSiteDto, QuerySitesDto, UpdateSiteDto } from './dto/site.dto';
import { SitesService } from './sites.service';

@ApiTags('Référentiel géographique')
@ApiBearerAuth()
@Controller('sites')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SITE_READ)
  @ApiOperation({ summary: 'Liste des sites et quartiers' })
  findAll(@Query() query: QuerySitesDto) {
    return this.sites.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SITE_READ)
  @ApiOperation({ summary: "Détail d'un site" })
  findOne(@Param() params: IdParamDto) {
    return this.sites.findOne(params.id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SITE_MANAGE)
  @ApiOperation({ summary: "Création d'un site" })
  create(
    @Body() dto: CreateSiteDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.sites.create(dto, actor, contextOf(request));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SITE_MANAGE)
  @ApiOperation({ summary: "Modification d'un site" })
  update(
    @Param() params: IdParamDto,
    @Body() dto: UpdateSiteDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.sites.update(params.id, dto, actor, contextOf(request));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.SITE_MANAGE)
  @ApiOperation({ summary: "Suppression d'un site" })
  remove(
    @Param() params: IdParamDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.sites.remove(params.id, actor, contextOf(request));
  }
}

function contextOf(request: Request): RequestContext {
  return {
    ip: request.ip,
    userAgent: request.get('user-agent') ?? undefined,
  };
}
