import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, Public, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/constants/rbac.constants';
import { IdParamDto } from '../common/dto/id-param.dto';
import { UuidParam } from '../common/pipes/uuid-param.pipe';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import {
  ActivateShareDto,
  CreateShareDto,
  QuerySharesDto,
} from './dto/property-share.dto';
import { PropertySharesService } from './property-shares.service';

/** Partages d'un bien : /api/properties/:id/share(s) */
@ApiTags('Partages')
@ApiBearerAuth()
@Controller('properties/:id')
export class PropertySharesController {
  constructor(private readonly shares: PropertySharesService) {}

  @Post('share')
  @RequirePermissions(PERMISSIONS.PROPERTY_SHARE)
  @ApiOperation({
    summary: "Partage d'un bien avec un bénéficiaire externe",
    description:
      "Crée une invitation à token aléatoire et envoie l'email d'activation. Le bénéficiaire définira lui-même son mot de passe.",
  })
  create(
    @Param() params: IdParamDto,
    @Body() dto: CreateShareDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.shares.create(params.id, dto, actor, contextOf(request));
  }

  @Get('shares')
  @RequirePermissions(PERMISSIONS.PROPERTY_SHARE)
  @ApiOperation({ summary: "Partages d'un bien" })
  findForProperty(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamDto,
  ) {
    return this.shares.findForProperty(user, params.id);
  }

  @Delete('shares/:shareId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PROPERTY_SHARE)
  @ApiParam({ name: 'shareId', format: 'uuid' })
  @ApiOperation({
    summary: "Révocation d'un partage",
    description:
      "L'effet est immédiat : les sessions du bénéficiaire sont coupées sans attendre l'expiration de son token.",
  })
  revoke(
    @Param('id', UuidParam) id: string,
    @Param('shareId', UuidParam) shareId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.shares.revoke(id, shareId, actor, contextOf(request));
  }

  @Post('shares/:shareId/resend')
  @RequirePermissions(PERMISSIONS.PROPERTY_SHARE)
  @ApiParam({ name: 'shareId', format: 'uuid' })
  @ApiOperation({
    summary: "Renvoi d'une invitation",
    description: "Un nouveau token est généré ; l'ancien lien cesse d'être valide.",
  })
  resend(
    @Param('id', UuidParam) id: string,
    @Param('shareId', UuidParam) shareId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.shares.resend(id, shareId, actor, contextOf(request));
  }
}

/** Vue transverse et parcours public : /api/shares */
@ApiTags('Partages')
@Controller('shares')
export class SharesController {
  constructor(private readonly shares: PropertySharesService) {}

  @Get()
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.PROPERTY_SHARE)
  @ApiOperation({ summary: 'Tous les partages, filtrables par statut' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QuerySharesDto,
  ) {
    return this.shares.findAll(user, query);
  }

  @Public()
  @Get('validate/:token')
  // Limite stricte : cette route permettrait sinon de tester des tokens en
  // masse pour découvrir une invitation valide.
  @Throttle({ auth: { limit: 20, ttl: 300_000 } })
  @ApiOperation({
    summary: "Vérification d'une invitation",
    description:
      "Confirme la validité du lien sans exposer d'information patrimoniale.",
  })
  validate(@Param('token') token: string) {
    return this.shares.validateToken(token);
  }

  @Public()
  @Post('activate')
  @Throttle({ auth: { limit: 10, ttl: 900_000 } })
  @ApiOperation({
    summary: "Activation d'un partage",
    description:
      'Le bénéficiaire définit son mot de passe ; le compte créé porte uniquement le rôle UTILISATEUR_PARTAGE.',
  })
  activate(@Body() dto: ActivateShareDto, @Req() request: Request) {
    return this.shares.activate(dto, contextOf(request));
  }
}

function contextOf(request: Request): RequestContext {
  return {
    ip: request.ip,
    userAgent: request.get('user-agent') ?? undefined,
  };
}
