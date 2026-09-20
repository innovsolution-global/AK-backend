import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  PropertySharesController,
  SharesController,
} from './property-shares.controller';
import { PropertySharesService } from './property-shares.service';
import { SharedAccessController } from './shared-access.controller';
import { SharedAccessService } from './shared-access.service';

@Module({
  imports: [AuthModule],
  controllers: [
    PropertySharesController,
    SharesController,
    SharedAccessController,
  ],
  providers: [PropertySharesService, SharedAccessService],
  exports: [PropertySharesService],
})
export class PropertySharesModule {}
