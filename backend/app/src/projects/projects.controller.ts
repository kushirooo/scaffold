import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AssignProjectMemberDto } from './dto/assign-project-member.dto.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { ProjectsService } from './projects.service.js';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateProjectDto,
  ) {
    this.requireProjectManager(user);
    return this.projects.create(user.id, input);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    this.requireProjectManager(user);
    return this.projects.findAll(user.id);
  }

  @Get('archived')
  findArchived(@CurrentUser() user: AuthenticatedUser) {
    this.requireProjectManager(user);
    return this.projects.findArchived(user.id);
  }

  @Get('assignable-workers')
  findAssignableWorkers(@CurrentUser() user: AuthenticatedUser) {
    this.requireProjectManager(user);
    return this.projects.findAssignableWorkers();
  }

  @Get('assigned')
  findAssignedToWorker(@CurrentUser() user: AuthenticatedUser) {
    if (user.role !== 'WORKER') {
      throw new ForbiddenException('Worker role required');
    }
    return this.projects.findAssignedToWorker(user.id);
  }

  @Post(':id/members')
  assignWorker(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: AssignProjectMemberDto,
  ) {
    this.requireProjectManager(user);
    return this.projects.assignWorker(user.id, id, input.userId, input.projectRole);
  }

  @Delete(':id/members/:userId')
  removeWorker(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    this.requireProjectManager(user);
    return this.projects.removeWorker(user.id, id, userId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    this.requireProjectManager(user);
    return this.projects.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: UpdateProjectDto,
  ) {
    this.requireProjectManager(user);
    return this.projects.update(user.id, id, input);
  }

  @Delete(':id')
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    this.requireProjectManager(user);
    return this.projects.archive(user.id, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    this.requireProjectManager(user);
    return this.projects.restore(user.id, id);
  }

  private requireProjectManager(user: AuthenticatedUser): void {
    if (user.role !== 'PROJECT_MANAGER') {
      throw new ForbiddenException('Project Manager role required');
    }
  }
}
