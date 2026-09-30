import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MapsModule } from '../maps/maps.module';
import { EarthLinkService } from './earth-link.service';
import { PropertySharesController, SharesController } from './property-shares.controller';
import { PropertySharesService } from './property-shares.service';
import { PublicEarthController } from './public-earth.controller';
import { SharedAccessController } from './shared-access.controller';
import { SharedAccessService } from './shared-access.service';

@Module({
  imports: [AuthModule, MapsModule],
  controllers: [
    PropertySharesController,
    SharesController,
    SharedAccessController,
    PublicEarthController,
  ],
  providers: [PropertySharesService, SharedAccessService, EarthLinkService],
  exports: [PropertySharesService],
})
export class PropertySharesModule {}
