import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/constants/rbac.constants';
import { IdParamDto } from '../common/dto/id-param.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { UpdateRolePermissionsDto } from './dto/role.dto';
import { RolesService } from './roles.service';

@ApiTags('Rôles et permissions')
@ApiBearerAuth()
@Controller()
@RequirePermissions(PERMISSIONS.ROLE_MANAGE)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('roles')
  @ApiOperation({ summary: 'Liste des rôles et de leurs permissions' })
  findAll() {
    return this.roles.findAll();
  }

  @Get('roles/:id')
  @ApiOperation({ summary: "Détail d'un rôle" })
  findOne(@Param() params: IdParamDto) {
    return this.roles.findOne(params.id);
  }

  @Put('roles/:id/permissions')
  @ApiOperation({
    summary: "Remplacement des permissions d'un rôle",
    description:
      'Les sessions des porteurs du rôle sont invalidées pour que le changement prenne effet immédiatement.',
  })
  updatePermissions(
    @Param() params: IdParamDto,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.roles.updatePermissions(params.id, dto, actor);
  }

  @Get('permissions')
  @ApiOperation({ summary: 'Catalogue des permissions, groupées par ressource' })
  listPermissions() {
    return this.roles.listPermissions();
  }
}
