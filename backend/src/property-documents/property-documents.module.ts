import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AppConfigService } from '../config/app-config.service';
import {
  DocumentsController,
  PropertyDocumentsController,
} from './property-documents.controller';
import { PropertyDocumentsService } from './property-documents.service';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        // Les fichiers transitent en mémoire : ils sont validés (signature
        // binaire comprise) avant d'atteindre le stockage objet, et rien n'est
        // jamais écrit sur le disque du serveur.
        storage: memoryStorage(),
        limits: {
          fileSize: config.maxFileSizeBytes,
          files: 1,
        },
      }),
    }),
  ],
  controllers: [PropertyDocumentsController, DocumentsController],
  providers: [PropertyDocumentsService],
  exports: [PropertyDocumentsService],
})
export class PropertyDocumentsModule {}
