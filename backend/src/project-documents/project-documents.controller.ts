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
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/constants/rbac.constants';
import { IdParamDto } from '../common/dto/id-param.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type { UploadedFile as MulterFile } from '../uploads/file-validation.service';
import {
  QueryProjectDocumentsDto,
  UploadProjectDocumentDto,
} from './dto/project-document.dto';
import { ProjectDocumentsService } from './project-documents.service';

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('projects/:id/documents')
export class ProjectDocumentsController {
  constructor(private readonly documents: ProjectDocumentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DOCUMENT_READ)
  @ApiOperation({ summary: "Dossiers d'études et plans d'un projet" })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamDto,
    @Query() query: QueryProjectDocumentsDto,
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
        type: { type: 'string' },
        componentId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiOperation({ summary: "Téléversement d'un dossier d'étude" })
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: IdParamDto,
    @Body() dto: UploadProjectDocumentDto,
    @UploadedFile() file: MulterFile,
    @Req() request: Request,
  ) {
    return this.documents.upload(user, params.id, dto, file, contextOf(request));
  }
}

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('project-documents')
export class ProjectDocumentActionsController {
  constructor(private readonly documents: ProjectDocumentsService) {}

  @Get(':id/download')
  @RequirePermissions(PERMISSIONS.DOCUMENT_READ)
  @ApiOperation({ summary: 'URL de téléchargement signée' })
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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.DOCUMENT_DELETE)
  @ApiOperation({ summary: "Suppression logique d'un dossier d'étude" })
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
