import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StaffGuard } from '../auth/staff.guard';
import { DatabaseModule } from '../database/database.module';
import { UsersModule } from '../users/users.module';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  imports: [DatabaseModule, AuthModule, UsersModule],
  controllers: [ClassesController],
  providers: [ClassesService, StaffGuard],
})
export class ClassesModule {}
