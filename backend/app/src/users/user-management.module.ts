import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UserManagementController } from './user-management.controller.js';
import { UserManagementAdminGuard } from './user-management.guard.js';
import { UserManagementService } from './user-management.service.js';

@Module({
  imports: [AuthModule],
  controllers: [UserManagementController],
  providers: [UserManagementService, UserManagementAdminGuard],
})
export class UserManagementModule {}
