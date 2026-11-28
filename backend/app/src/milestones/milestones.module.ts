import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { MilestonesController } from './milestones.controller.js';
import { MilestonesService } from './milestones.service.js';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [MilestonesController],
  providers: [MilestonesService],
})
export class MilestonesModule {}
