import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/constants/rbac.constants';
import { IdParamDto } from '../common/dto/id-param.dto';
import { UuidParam } from '../common/pipes/uuid-param.pipe';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type { UploadedFile as MulterFile } from '../uploads/file-validation.service';
import { GoogleEarthService } from './google-earth.service';

@ApiTags('Cartographie')
@ApiBearerAuth()
@Controller('properties/:id/google-earth')
export class GoogleEarthController {
  constructor(private readonly googleEarth: GoogleEarthService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROPERTY_READ)
  @ApiOperation({ summary: "Fichiers Google Earth d'un terrain" })
  findAll(@CurrentUser() user: AuthenticatedUser, @Param() params: IdParamDto) {
    return this.googleEarth.findAll(user, params.id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DOCUMENT_UPLOAD)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: "Import d'un fichier .KML ou .KMZ",
    description:
      "Le fichier est vérifié, stocké et associé au domaine. Les données géographiques sont extraites quand c'est possible ; un fichier illisible reste conservé avec un statut d'extraction explicite.",
  })
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamDto,
    @UploadedFile() file: MulterFile,
    @Req() request: Request,
  ) {
    return this.googleEarth.upload(user, params.id, file, contextOf(request));
  }

  @Get(':fileId/geometry')
  @RequirePermissions(PERMISSIONS.PROPERTY_READ)
  @ApiParam({ name: 'fileId', format: 'uuid' })
  @ApiOperation({ summary: 'Géométrie GeoJSON extraite, pour la carte' })
  geometry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParam) id: string,
    @Param('fileId', UuidParam) fileId: string,
  ) {
    return this.googleEarth.findGeometry(user, id, fileId);
  }

  @Get(':fileId/download')
  @RequirePermissions(PERMISSIONS.DOCUMENT_READ)
  @ApiParam({ name: 'fileId', format: 'uuid' })
  @ApiOperation({
    summary: 'URL signée du fichier',
    description: "Permet de l'ouvrir dans Google Earth. Le chemin physique n'est jamais exposé.",
  })
  download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParam) id: string,
    @Param('fileId', UuidParam) fileId: string,
    @Req() request: Request,
  ) {
    return this.googleEarth.getDownloadUrl(user, id, fileId, contextOf(request));
  }

  @Delete(':fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.DOCUMENT_DELETE)
  @ApiParam({ name: 'fileId', format: 'uuid' })
  @ApiOperation({ summary: "Suppression d'un fichier Google Earth" })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParam) id: string,
    @Param('fileId', UuidParam) fileId: string,
    @Req() request: Request,
  ) {
    return this.googleEarth.remove(user, id, fileId, contextOf(request));
  }
}

function contextOf(request: Request): RequestContext {
  return {
    ip: request.ip,
    userAgent: request.get('user-agent') ?? undefined,
  };
}
