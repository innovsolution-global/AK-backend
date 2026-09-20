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
  findMarkers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryMapDto,
  ) {
    return this.maps.findMarkers(user, query);
  }

  @Get('bounds')
  @RequirePermissions(PERMISSIONS.MAP_READ)
  @ApiOperation({ summary: 'Emprise globale du patrimoine visible' })
  findBounds(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryMapDto) {
    return this.maps.findBounds(user, query);
  }
}
