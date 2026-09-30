import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/constants/rbac.constants';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { DashboardService } from './dashboard.service';

@ApiTags('Tableau de bord')
@ApiBearerAuth()
@Controller('dashboard')
@RequirePermissions(PERMISSIONS.DASHBOARD_READ)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Indicateurs de synthèse',
    description:
      "Terrains, superficie totale, villes, sites, statuts, projets, documents, partages actifs et expirant sous 7 jours — le tout limité au périmètre de l'utilisateur.",
  })
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.overview(user);
  }

  @Get('properties')
  @ApiOperation({ summary: 'Répartition des terrains par statut et par ville' })
  properties(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.properties(user);
  }

  @Get('projects')
  @ApiOperation({ summary: 'Répartition des projets et des permis' })
  projects(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.projects(user);
  }

  @Get('documents')
  @ApiOperation({ summary: 'Volumétrie documentaire par type' })
  documents(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.documents(user);
  }

  @Get('acquisitions')
  @ApiQuery({ name: 'months', required: false, description: '6 à 60, défaut 24' })
  @ApiOperation({
    summary: 'Chronologie des acquisitions par mois',
    description:
      'Tous les mois de la fenêtre sont renvoyés, y compris ceux sans acquisition.',
  })
  acquisitions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('months', new ParseIntPipe({ optional: true })) months?: number,
  ) {
    // Borné : une fenêtre libre permettrait de remonter tout l'historique
    // d'un patrimoine de plusieurs milliers de biens en une requête.
    const window = Math.min(Math.max(months ?? 24, 6), 60);
    return this.dashboard.acquisitions(user, window);
  }

  @Get('activity')
  @ApiOperation({
    summary: 'Activité récente et échéances',
    description:
      'Dernières actions, partages expirant sous 30 jours, invitations en attente.',
  })
  activity(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.activity(user);
  }
}
