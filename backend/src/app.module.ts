import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { CommonModule } from './common/common.module';
import { CompaniesModule } from './companies/companies.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { SharedUserRestrictionGuard } from './common/guards/shared-user-restriction.guard';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { LocationsModule } from './locations/locations.module';
import { MailModule } from './mail/mail.module';
import { MapsModule } from './maps/maps.module';
import { PrismaModule } from './prisma/prisma.module';
import { PropertiesModule } from './properties/properties.module';
import { ProjectDocumentsModule } from './project-documents/project-documents.module';
import { ProjectsModule } from './projects/projects.module';
import { PropertyDocumentsModule } from './property-documents/property-documents.module';
import { PropertySharesModule } from './property-shares/property-shares.module';
import { RolesModule } from './roles/roles.module';
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
    // appliqué explicitement aux routes d'authentification via @Throttle.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120 },
      { name: 'auth', ttl: 300_000, limit: 10 },
    ]),

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

    HealthModule,
  ],
  providers: [
    // L'ordre des guards globaux suit la chaîne d'accès du doc 1 :
    // rate limit → authentification → confinement du bénéficiaire → rôle →
    // permission.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: SharedUserRestrictionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },

    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
