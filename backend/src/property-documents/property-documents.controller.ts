import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
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
  ApiTags,
} from '@nestjs/swagger';
import { Body } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/constants/rbac.constants';
import { IdParamDto } from '../common/dto/id-param.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type { UploadedFile as MulterFile } from '../uploads/file-validation.service';
import {
  QueryPropertyDocumentsDto,
  UploadDocumentVersionDto,
  UploadPropertyDocumentDto,
} from './dto/property-document.dto';
import { PropertyDocumentsService } from './property-documents.service';

/** Routes rattachées à un terrain : /api/properties/:id/documents */
@ApiTags('Documents')
@ApiBearerAuth()
@Controller('properties/:id/documents')
export class PropertyDocumentsController {
  constructor(private readonly documents: PropertyDocumentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DOCUMENT_READ)
  @ApiOperation({ summary: "Documents d'un terrain" })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamDto,
    @Query() query: QueryPropertyDocumentsDto,
  ) {
    return this.documents.findAll(user, params.id, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DOCUMENT_UPLOAD)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'name', 'type'],
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string' },
        type: { type: 'string', enum: ['TITRE_FONCIER', 'PLAN_DE_MASSE', 'AUTRE'] },
      },
    },
  })
  @ApiOperation({
    summary: "Téléversement d'un document",
    description:
      'Extension, type MIME, signature binaire et taille sont vérifiés ; les exécutables sont refusés.',
  })
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamDto,
    @Body() dto: UploadPropertyDocumentDto,
    @UploadedFile() file: MulterFile,
    @Req() request: Request,
  ) {
    return this.documents.upload(user, params.id, dto, file, contextOf(request));
  }
}

/** Routes portant sur un document : /api/documents/:id */
@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: PropertyDocumentsService) {}

  @Get(':id')
  @RequirePermissions(PERMISSIONS.DOCUMENT_READ)
  @ApiOperation({ summary: "Métadonnées d'un document" })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param() params: IdParamDto) {
    return this.documents.findOne(user, params.id);
  }

  @Get(':id/download')
  @RequirePermissions(PERMISSIONS.DOCUMENT_READ)
  @ApiOperation({
    summary: 'URL de téléchargement signée',
    description:
      "Renvoie une URL temporaire. La clé de stockage n'est jamais exposée (§25).",
  })
  download(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamDto,
    @Query('inline') inline: string,
    @Req() request: Request,
  ) {
    return this.documents.getDownloadUrl(
      user,
      params.id,
      inline === 'true',
      contextOf(request),
    );
  }

  @Get(':id/versions')
  @RequirePermissions(PERMISSIONS.DOCUMENT_READ)
  @ApiOperation({ summary: "Historique des versions d'un document" })
  versions(@CurrentUser() user: AuthenticatedUser, @Param() params: IdParamDto) {
    return this.documents.findVersions(user, params.id);
  }

  @Post(':id/versions')
  @RequirePermissions(PERMISSIONS.DOCUMENT_UPLOAD)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string' },
      },
    },
  })
  @ApiOperation({
    summary: "Ajout d'une nouvelle version",
    description: "Aucun fichier n'est écrasé : une nouvelle ligne est créée (§13).",
  })
  uploadVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamDto,
    @Body() dto: UploadDocumentVersionDto,
    @UploadedFile() file: MulterFile,
    @Req() request: Request,
  ) {
    return this.documents.uploadVersion(
      user,
      params.id,
      dto,
      file,
      contextOf(request),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.DOCUMENT_DELETE)
  @ApiOperation({ summary: "Suppression logique d'un document" })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamDto,
    @Req() request: Request,
  ) {
    return this.documents.remove(user, params.id, contextOf(request));
  }
}

function contextOf(request: Request): RequestContext {
  return {
    ip: request.ip,
    userAgent: request.get('user-agent') ?? undefined,
  };
}
