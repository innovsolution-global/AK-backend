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
  Put,
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
import {
  AssignManagersDto,
  CreatePropertyDto,
  QueryPropertiesDto,
  ReplaceCoordinatesDto,
  UpdatePropertyDto,
} from './dto/property.dto';
import { PropertiesService } from './properties.service';

@ApiTags('Terrains & Domaines')
@ApiBearerAuth()
@Controller('properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROPERTY_READ)
  @ApiOperation({
    summary: 'Liste paginée des terrains',
    description:
      "Limitée au périmètre de l'utilisateur : un gestionnaire ne voit que les biens qui lui sont attribués.",
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryPropertiesDto,
  ) {
    return this.properties.findAll(user, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PROPERTY_READ)
  @ApiOperation({ summary: "Fiche d'un terrain" })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param() params: IdParamDto) {
    return this.properties.findOne(user, params.id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PROPERTY_CREATE)
  @ApiOperation({
    summary: "Création d'un terrain",
    description: 'La référence AK-IMM-XXXXXX est générée automatiquement.',
  })
  create(
    @Body() dto: CreatePropertyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.properties.create(dto, actor, contextOf(request));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PROPERTY_UPDATE)
  @ApiOperation({ summary: "Modification d'un terrain" })
  update(
    @Param() params: IdParamDto,
    @Body() dto: UpdatePropertyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.properties.update(params.id, dto, actor, contextOf(request));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PROPERTY_DELETE)
  @ApiOperation({
    summary: "Suppression d'un terrain",
    description:
      'Suppression logique. Les partages en cours sur ce bien sont révoqués simultanément.',
  })
  remove(
    @Param() params: IdParamDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.properties.remove(params.id, actor, contextOf(request));
  }

  // --- Coordonnées ----------------------------------------------------------

  @Get(':id/coordinates')
  @RequirePermissions(PERMISSIONS.PROPERTY_READ)
  @ApiOperation({ summary: "Coordonnées d'un terrain" })
  getCoordinates(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamDto,
  ) {
    return this.properties.getCoordinates(user, params.id);
  }

  @Put(':id/coordinates')
  @RequirePermissions(PERMISSIONS.PROPERTY_UPDATE)
  @ApiOperation({
    summary: 'Remplacement des coordonnées',
    description: "L'ensemble des points est remplacé par la liste transmise.",
  })
  replaceCoordinates(
    @Param() params: IdParamDto,
    @Body() dto: ReplaceCoordinatesDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.properties.replaceCoordinates(
      params.id,
      dto,
      actor,
      contextOf(request),
    );
  }

  // --- Gestionnaires --------------------------------------------------------

  @Get(':id/managers')
  @RequirePermissions(PERMISSIONS.PROPERTY_READ)
  @ApiOperation({ summary: "Gestionnaires d'un terrain" })
  getManagers(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamDto,
  ) {
    return this.properties.getManagers(user, params.id);
  }

  @Put(':id/managers')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Affectation des gestionnaires' })
  setManagers(
    @Param() params: IdParamDto,
    @Body() dto: AssignManagersDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.properties.setManagers(params.id, dto, actor, contextOf(request));
  }

  @Get(':id/history')
  @RequirePermissions(PERMISSIONS.PROPERTY_READ)
  @ApiOperation({ summary: "Historique des actions sur le terrain" })
  getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamDto,
  ) {
    return this.properties.getHistory(user, params.id);
  }
}

function contextOf(request: Request): RequestContext {
  return {
    ip: request.ip,
    userAgent: request.get('user-agent') ?? undefined,
  };
}
