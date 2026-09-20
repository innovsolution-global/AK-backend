import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AppConfigService } from '../config/app-config.service';
import {
  ProjectDocumentActionsController,
  ProjectDocumentsController,
} from './project-documents.controller';
import { ProjectDocumentsService } from './project-documents.service';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        storage: memoryStorage(),
        limits: { fileSize: config.maxFileSizeBytes, files: 1 },
      }),
    }),
  ],
  controllers: [ProjectDocumentsController, ProjectDocumentActionsController],
  providers: [ProjectDocumentsService],
  exports: [ProjectDocumentsService],
})
export class ProjectDocumentsModule {}
