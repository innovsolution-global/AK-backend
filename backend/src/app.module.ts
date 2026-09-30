import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { CommonModule } from './common/common.module';
import { CompaniesModule } from './companies/companies.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { SharedUserRestrictionGuard } from './common/guards/shared-user-restriction.guard';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { AppConfigModule } from './config/config.module';
import { AppConfigService } from './config/app-config.service';
import { HealthModule } from './health/health.module';
import { LocationsModule } from './locations/locations.module';
import { MailModule } from './mail/mail.module';
import { MapsModule } from './maps/maps.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { PropertiesModule } from './properties/properties.module';
import { ProjectDocumentsModule } from './project-documents/project-documents.module';
import { ProjectsModule } from './projects/projects.module';
import { PropertyDocumentsModule } from './property-documents/property-documents.module';
import { PropertySharesModule } from './property-shares/property-shares.module';
import { RolesModule } from './roles/roles.module';
import { SearchModule } from './search/search.module';
import { SitesModule } from './sites/sites.module';
import { StorageModule } from './storage/storage.module';
import { TasksModule } from './tasks/tasks.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    CommonModule,
    AuditModule,
    MailModule,
    StorageModule,
    UploadsModule,
    ScheduleModule.forRoot(),

    // Deux limiteurs : « default » pour l'API, « auth » — bien plus strict —
    // réservé aux routes qui le déclarent via @Throttle({ auth: … }).
    //
    // Depuis @nestjs/throttler v5, **tout** limiteur nommé s'applique à toutes
    // les routes : sans le `skipIf` ci-dessous, « auth » (10 appels / 5 min)
    // bridait chaque route de l'API — ouvrir onze fiches de terrain en cinq
    // minutes renvoyait un 429.
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const { ttl, limit, authTtl, authLimit } = config.throttle;
        return [
          { name: 'default', ttl: ttl * 1000, limit },
          {
            name: 'auth',
            ttl: authTtl * 1000,
            limit: authLimit,
            skipIf: (context) =>
              !Reflect.getMetadata('THROTTLER:LIMITauth', context.getHandler()) &&
              !Reflect.getMetadata('THROTTLER:LIMITauth', context.getClass()),
          },
        ];
      },
    }),

    // Phase 1 — socle et contrôle d'accès
    AuthModule,
    UsersModule,
    RolesModule,

    // Phase 2 — patrimoine et cartographie
    LocationsModule,
    SitesModule,
    PropertiesModule,
    MapsModule,

    // Phase 3 — documents, stockage sécurisé, Google Earth
    PropertyDocumentsModule,

    // Phase 4 — projets, composantes, permis, entreprises
    CompaniesModule,
    ProjectsModule,
    ProjectDocumentsModule,

    // Phase 5 — partage sécurisé et accès temporaire
    PropertySharesModule,
    TasksModule,

    // Phase 6 — pilotage : dashboard, recherche, notifications, audit
    DashboardModule,
    SearchModule,
    NotificationsModule,

    HealthModule,
  ],
  providers: [
    // L'ordre des guards globaux suit la chaîne d'accès du doc 1 :
    // authentification → rate limit (par utilisateur, ou par IP sur les routes
    // publiques) → confinement du bénéficiaire → rôle → permission.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: SharedUserRestrictionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },

    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
