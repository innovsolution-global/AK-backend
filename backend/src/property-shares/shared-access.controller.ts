import { Controller, Get, Param, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, Roles } from '../common/decorators';
import { ROLES } from '../common/constants/rbac.constants';
import { IdParamDto } from '../common/dto/id-param.dto';
import { UuidParam } from '../common/pipes/uuid-param.pipe';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import { SharedAccessService } from './shared-access.service';

/**
 * Espace du bénéficiaire (§22).
 *
 * Réservé au rôle `UTILISATEUR_PARTAGE` : ce sont les **seules** routes qui lui
 * sont accessibles. Toutes les réponses sont construites en liste blanche.
 */
@ApiTags('Accès partagé')
@ApiBearerAuth()
@Roles(ROLES.UTILISATEUR_PARTAGE)
@Controller('shared')
export class SharedAccessController {
  constructor(private readonly shared: SharedAccessService) {}

  @Get('properties')
  @ApiOperation({ summary: 'Biens qui me sont partagés' })
  findMyProperties(@CurrentUser() user: AuthenticatedUser) {
    return this.shared.findMyProperties(user);
  }

  @Get('properties/:id')
  @ApiOperation({
    summary: "Fiche restreinte d'un bien partagé",
    description:
      'Référence, localisation, superficie, coordonnées, carte et Google Earth selon les autorisations du partage. Aucune information interne.',
  })
  findProperty(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamDto,
    @Req() request: Request,
  ) {
    return this.shared.findProperty(user, params.id, contextOf(request));
  }

  @Get('properties/:id/documents')
  @ApiOperation({
    summary: 'Documents autorisés',
    description: "Uniquement ceux inscrits sur la liste blanche du partage.",
  })
  findDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamDto,
  ) {
    return this.shared.findDocuments(user, params.id);
  }

  @Get('properties/:id/google-earth/:fileId/download')
  @ApiParam({ name: 'fileId', format: 'uuid' })
  @ApiOperation({ summary: 'URL signée du fichier Google Earth' })
  downloadGeoFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParam) id: string,
    @Param('fileId', UuidParam) fileId: string,
    @Req() request: Request,
  ) {
    return this.shared.getGeoFileDownloadUrl(user, id, fileId, contextOf(request));
  }

  @Get('documents/:id/download')
  @ApiOperation({ summary: "URL signée d'un document autorisé" })
  downloadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamDto,
    @Req() request: Request,
  ) {
    return this.shared.getDocumentDownloadUrl(
      user,
      params.id,
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
