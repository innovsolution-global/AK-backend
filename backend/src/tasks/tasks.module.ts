import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PropertySharesModule } from '../property-shares/property-shares.module';
import { TasksService } from './tasks.service';

@Module({
  imports: [AuthModule, PropertySharesModule],
  providers: [TasksService],
})
export class TasksModule {}
