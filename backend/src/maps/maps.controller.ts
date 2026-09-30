import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/constants/rbac.constants';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { QueryMapDto } from './dto/map.dto';
import { MapsService } from './maps.service';

@ApiTags('Cartographie')
@ApiBearerAuth()
@Controller('maps')
export class MapsController {
  constructor(private readonly maps: MapsService) {}

  @Get('properties')
  @RequirePermissions(PERMISSIONS.MAP_READ)
  @ApiOperation({
    summary: 'Markers des terrains',
    description:
      "Projection allégée, limitée au périmètre de l'utilisateur. Seuls les terrains dotés d'un point principal apparaissent.",
  })
  findMarkers(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryMapDto) {
    return this.maps.findMarkers(user, query);
  }

  @Get('parcels')
  @RequirePermissions(PERMISSIONS.MAP_READ)
  @ApiOperation({
    summary: 'Emprises des terrains (GeoJSON)',
    description:
      'Un polygone par terrain doté d’au moins trois bornes, dans le périmètre de l’utilisateur. Complète la couche des markers.',
  })
  findParcels(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryMapDto) {
    return this.maps.findParcels(user, query);
  }

  @Get('bounds')
  @RequirePermissions(PERMISSIONS.MAP_READ)
  @ApiOperation({ summary: 'Emprise globale du patrimoine visible' })
  findBounds(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryMapDto) {
    return this.maps.findBounds(user, query);
  }
}
