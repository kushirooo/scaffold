import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ROLE_PERMISSIONS } from './user-permissions.js';

@Injectable()
export class UserManagementAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const permissions = request.user
      ? ROLE_PERMISSIONS[request.user.role]
      : [];
    if (!permissions.includes('users:manage')) {
      throw new ForbiddenException('Administrator access required.');
    }
    return true;
  }
}
