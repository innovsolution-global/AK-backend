import { Global, Module } from '@nestjs/common';
import { ReferenceService } from './services/reference.service';
import { ScopeService } from './services/scope.service';

@Global()
@Module({
  providers: [ScopeService, ReferenceService],
  exports: [ScopeService, ReferenceService],
})
export class CommonModule {}
