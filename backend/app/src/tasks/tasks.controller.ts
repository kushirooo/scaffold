import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ApiSingleMessageFilter } from '../common/filters/api-single-message.filter.js';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto.js';
import { TasksService } from './tasks.service.js';

@Controller()
@UseGuards(JwtAuthGuard)
@UseFilters(ApiSingleMessageFilter)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post('projects/:projectId/tasks')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUuidPipe) projectId: string,
    @Body() input: CreateTaskDto,
  ) {
    const data = await this.tasks.create(user, projectId, input);
    return { message: 'Task created successfully.', data };
  }

  @Get('projects/:projectId/tasks')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUuidPipe) projectId: string,
    @Query() query: ListTasksQueryDto,
  ) {
    const data = await this.tasks.list(user, projectId, query);
    return { data };
  }

  @Get('tasks/:taskId')
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', ParseUuidPipe) taskId: string,
  ) {
    const data = await this.tasks.getOne(user, taskId);
    return { data };
  }

  @Delete('tasks/:taskId')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', ParseUuidPipe) taskId: string,
  ) {
    const data = await this.tasks.remove(user, taskId);
    return { message: 'Task deleted successfully.', data };
  }

  @Patch('tasks/:taskId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', ParseUuidPipe) taskId: string,
    @Body() input: UpdateTaskDto,
  ) {
    const data = await this.tasks.update(user, taskId, input);
    return { message: 'Task updated successfully.', data };
  }

  @Patch('tasks/:taskId/status')
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', ParseUuidPipe) taskId: string,
    @Body() input: UpdateTaskStatusDto,
  ) {
    const data = await this.tasks.updateStatus(user, taskId, input);
    return { message: 'Task status updated.', data };
  }
}
