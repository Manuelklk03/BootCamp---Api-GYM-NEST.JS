import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { PlansModule } from './plans/plans.module';
import { ClassesModule } from './classes/classes.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [DatabaseModule, PlansModule, ClassesModule, AuthModule],
  controllers: [AppController],
})
export class AppModule {}
