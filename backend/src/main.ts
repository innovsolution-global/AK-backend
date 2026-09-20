import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });

  const config = app.get(AppConfigService);

  // --- Sécurité (§29) ------------------------------------------------------
  app.use(
    helmet({
      // L'API ne sert pas de HTML : une CSP stricte suffit et évite
      // d'interférer avec Swagger UI, servi sur la même origine.
      contentSecurityPolicy: config.isProduction ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  app.use(cookieParser());

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true, // requis pour le cookie de refresh
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86_400,
  });

  // Derrière un reverse proxy, `request.ip` doit refléter le client réel :
  // sans cela, le rate limiting s'appliquerait à l'IP du proxy.
  app.set('trust proxy', 1);

  app.setGlobalPrefix(config.apiPrefix);

  // --- Validation ----------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // retire les champs non déclarés dans le DTO
      forbidNonWhitelisted: true, // et refuse la requête s'il y en a
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      stopAtFirstError: false,
    }),
  );

  // --- Swagger (§32) -------------------------------------------------------
  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('AK IMMO — API')
        .setDescription(
          'Plateforme privée de gestion de patrimoine immobilier. ' +
            'Toutes les routes sont protégées sauf mention explicite.',
        )
        .setVersion('0.1.0')
        .addBearerAuth(
          { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          'access-token',
        )
        .addTag('Authentification')
        .addTag('Utilisateurs')
        .addTag('Terrains & Domaines')
        .addTag('Projets')
        .addTag('Documents')
        .addTag('Partages')
        .build(),
    );

    SwaggerModule.setup(`${config.apiPrefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  app.get(PrismaService).enableShutdownHooks(app);
  app.enableShutdownHooks();

  await app.listen(config.port);

  logger.log(`API démarrée sur http://localhost:${config.port}/${config.apiPrefix}`);
  if (!config.isProduction) {
    logger.log(
      `Documentation : http://localhost:${config.port}/${config.apiPrefix}/docs`,
    );
  }
}

void bootstrap();
