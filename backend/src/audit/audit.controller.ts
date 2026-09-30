import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/constants/rbac.constants';
import { IdParamDto } from '../common/dto/id-param.dto';
import { AuditQueryService } from './audit-query.service';
import { QueryAuditLogsDto } from './dto/audit.dto';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit-logs')
@RequirePermissions(PERMISSIONS.AUDIT_READ)
export class AuditController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  @ApiOperation({
    summary: "Journal d'audit",
    description:
      'Filtrable par utilisateur, action, entité et période. Table append-only : aucune route de modification ni de suppression.',
  })
  findAll(@Query() query: QueryAuditLogsDto) {
    return this.audit.findAll(query);
  }

  @Get('actions')
  @ApiOperation({ summary: 'Répartition des actions sur 30 jours' })
  statistics() {
    return this.audit.statistics();
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'une entrée d'audit" })
  findOne(@Param() params: IdParamDto) {
    return this.audit.findOne(params.id);
  }
}
