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
  CreateUserDto,
  QueryUsersDto,
  UpdateUserDto,
  UserResponseDto,
} from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('Utilisateurs')
@ApiBearerAuth()
@Controller('users')
@RequirePermissions(PERMISSIONS.USER_MANAGE)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Liste paginée des utilisateurs' })
  findAll(@Query() query: QueryUsersDto) {
    return this.users.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'un utilisateur" })
  findOne(@Param() params: IdParamDto): Promise<UserResponseDto> {
    return this.users.findOne(params.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Création d\'un utilisateur',
    description:
      "Sans mot de passe, le compte est créé inactif et un lien d'activation est envoyé par email.",
  })
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<UserResponseDto> {
    return this.users.create(dto, actor, contextOf(request));
  }

  @Patch(':id')
  @ApiOperation({ summary: "Modification d'un utilisateur" })
  update(
    @Param() params: IdParamDto,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<UserResponseDto> {
    return this.users.update(params.id, dto, actor, contextOf(request));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Suppression (soft delete) d'un utilisateur" })
  remove(
    @Param() params: IdParamDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    return this.users.remove(params.id, actor, contextOf(request));
  }

  @Post(':id/activate')
  @ApiOperation({ summary: "Activation d'un compte" })
  activate(
    @Param() params: IdParamDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<UserResponseDto> {
    return this.users.setActive(params.id, true, actor, contextOf(request));
  }

  @Post(':id/deactivate')
  @ApiOperation({
    summary: "Désactivation d'un compte",
    description: 'Les sessions en cours de cet utilisateur sont immédiatement coupées.',
  })
  deactivate(
    @Param() params: IdParamDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<UserResponseDto> {
    return this.users.setActive(params.id, false, actor, contextOf(request));
  }
}

function contextOf(request: Request): RequestContext {
  return {
    ip: request.ip,
    userAgent: request.get('user-agent') ?? undefined,
  };
}
