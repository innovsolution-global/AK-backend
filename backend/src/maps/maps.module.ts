import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AppConfigService } from '../config/app-config.service';
import { PropertiesModule } from '../properties/properties.module';
import { GoogleEarthController } from './google-earth.controller';
import { GoogleEarthService } from './google-earth.service';
import { KmlParserService } from './kml-parser.service';
import { MapsController } from './maps.controller';
import { MapsService } from './maps.service';

@Module({
  imports: [
    PropertiesModule,
    MulterModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        storage: memoryStorage(),
        limits: { fileSize: config.maxGeoFileSizeBytes, files: 1 },
      }),
    }),
  ],
  controllers: [MapsController, GoogleEarthController],
  providers: [MapsService, GoogleEarthService, KmlParserService],
  exports: [MapsService, KmlParserService],
})
export class MapsModule {}
