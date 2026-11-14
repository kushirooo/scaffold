import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UserManagementController } from './user-management.controller.js';
import { UserManagementAdminGuard } from './user-management.guard.js';
import { UserManagementService } from './user-management.service.js';

@Module({
  // AccountsModule exports WelcomeEmailService (US18); it imports AuthModule and
  // EmailModule only, so there is no module cycle back into user management.
  imports: [AuthModule, AccountsModule],
  controllers: [UserManagementController],
  providers: [UserManagementService, UserManagementAdminGuard],
})
export class UserManagementModule {}
