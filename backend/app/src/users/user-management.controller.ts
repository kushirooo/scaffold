import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  CreateManagedUserDto,
  UpdateManagedUserDto,
  UpdateManagedUserStatusDto,
} from './user-management.dto.js';
import { UserManagementAdminGuard } from './user-management.guard.js';
import { UserManagementService } from './user-management.service.js';

@Controller('users')
@UseGuards(JwtAuthGuard, UserManagementAdminGuard)
export class UserManagementController {
  constructor(private readonly users: UserManagementService) {}

  @Get()
  listUsers() {
    return this.users.listUsers();
  }

  @Get('roles')
  rolePermissions() {
    return { roles: this.users.rolePermissions() };
  }

  @Post()
  createUser(@Body() input: CreateManagedUserDto) {
    return this.users.createUser(input);
  }

  @Patch(':id')
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateManagedUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.updateUser(id, input, actor);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateManagedUserStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.updateStatus(id, input.status, actor);
  }

  @Post(':id/welcome-email/resend')
  @HttpCode(HttpStatus.OK)
  resendWelcomeEmail(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.resendWelcomeEmail(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.users.deleteUser(id, actor);
  }
}
