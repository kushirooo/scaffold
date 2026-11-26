import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ApiSingleMessageFilter } from '../common/filters/api-single-message.filter.js';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe.js';
import { CreateMilestoneDto } from './dto/create-milestone.dto.js';
import { UpdateMilestoneDto } from './dto/update-milestone.dto.js';
import { MilestonesService } from './milestones.service.js';

@Controller()
@UseGuards(JwtAuthGuard)
@UseFilters(ApiSingleMessageFilter)
export class MilestonesController {
  constructor(private readonly milestones: MilestonesService) {}

  @Post('projects/:projectId/milestones')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUuidPipe) projectId: string,
    @Body() input: CreateMilestoneDto,
  ) {
    const data = await this.milestones.create(user, projectId, input);
    return { message: 'Milestone created successfully.', data };
  }

  @Patch('milestones/:milestoneId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('milestoneId', ParseUuidPipe) milestoneId: string,
    @Body() input: UpdateMilestoneDto,
  ) {
    const data = await this.milestones.update(user, milestoneId, input);
    return { message: 'Milestone updated successfully.', data };
  }
}
