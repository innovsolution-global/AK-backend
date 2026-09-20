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
  CreateCompanyDto,
  QueryCompaniesDto,
  UpdateCompanyDto,
} from './dto/company.dto';
import { CompaniesService } from './companies.service';

@ApiTags('Entreprises')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COMPANY_READ)
  @ApiOperation({ summary: 'Liste des entreprises et gérants' })
  findAll(@Query() query: QueryCompaniesDto) {
    return this.companies.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.COMPANY_READ)
  @ApiOperation({ summary: "Détail d'une entreprise" })
  findOne(@Param() params: IdParamDto) {
    return this.companies.findOne(params.id);
  }

  @Get(':id/projects')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: "Projets gérés par l'entreprise" })
  findProjects(@Param() params: IdParamDto) {
    return this.companies.findProjects(params.id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE)
  @ApiOperation({ summary: "Création d'une entreprise" })
  create(
    @Body() dto: CreateCompanyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.companies.create(dto, actor, contextOf(request));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE)
  @ApiOperation({ summary: "Modification d'une entreprise" })
  update(
    @Param() params: IdParamDto,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.companies.update(params.id, dto, actor, contextOf(request));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE)
  @ApiOperation({ summary: "Suppression d'une entreprise" })
  remove(
    @Param() params: IdParamDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.companies.remove(params.id, actor, contextOf(request));
  }
}

function contextOf(request: Request): RequestContext {
  return {
    ip: request.ip,
    userAgent: request.get('user-agent') ?? undefined,
  };
}
