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
import {
  CreateLocationDto,
  QueryLocationsDto,
  UpdateLocationDto,
} from './dto/location.dto';
import { LocationsService } from './locations.service';

@ApiTags('Référentiel géographique')
@ApiBearerAuth()
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.LOCATION_READ)
  @ApiOperation({ summary: 'Liste des préfectures, villes et communes' })
  findAll(@Query() query: QueryLocationsDto) {
    return this.locations.findAll(query);
  }

  @Get('reference')
  @RequirePermissions(PERMISSIONS.LOCATION_READ)
  @ApiOperation({
    summary: 'Découpage administratif officiel de la Guinée',
    description:
      "Régions, préfectures et communes de Conakry, chacune indiquant si elle est déjà enregistrée. Déclaré avant ':id' pour ne pas être capté comme un identifiant.",
  })
  findReference() {
    return this.locations.findReference();
  }

  @Post('import-reference')
  @RequirePermissions(PERMISSIONS.LOCATION_MANAGE)
  @ApiOperation({
    summary: 'Import des localités officielles manquantes',
    description:
      'Idempotent : les localités déjà présentes (par nom normalisé ou par code) sont ignorées.',
  })
  importReference(@CurrentUser() actor: AuthenticatedUser, @Req() request: Request) {
    return this.locations.importReference(actor, contextOf(request));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.LOCATION_READ)
  @ApiOperation({ summary: "Détail d'une localité" })
  findOne(@Param() params: IdParamDto) {
    return this.locations.findOne(params.id);
  }

  @Get(':id/sites')
  @RequirePermissions(PERMISSIONS.SITE_READ)
  @ApiOperation({ summary: 'Sites rattachés à une localité' })
  findSites(@Param() params: IdParamDto) {
    return this.locations.findSites(params.id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.LOCATION_MANAGE)
  @ApiOperation({ summary: "Création d'une localité" })
  create(
    @Body() dto: CreateLocationDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.locations.create(dto, actor, contextOf(request));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.LOCATION_MANAGE)
  @ApiOperation({ summary: "Modification d'une localité" })
  update(
    @Param() params: IdParamDto,
    @Body() dto: UpdateLocationDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.locations.update(params.id, dto, actor, contextOf(request));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.LOCATION_MANAGE)
  @ApiOperation({
    summary: "Suppression d'une localité",
    description:
      'Refusée tant que la localité porte des sites, terrains ou projets actifs.',
  })
  remove(
    @Param() params: IdParamDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.locations.remove(params.id, actor, contextOf(request));
  }
}

function contextOf(request: Request): RequestContext {
  return {
    ip: request.ip,
    userAgent: request.get('user-agent') ?? undefined,
  };
}
