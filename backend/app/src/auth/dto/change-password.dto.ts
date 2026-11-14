import { IsString, MaxLength, MinLength } from 'class-validator';
import { IsPassword } from './is-password.decorator.js';

/**
 * US19 change-password request (SPRINT1_PLAN.md §7.7). The current password is
 * verified with the same generic 401 as login; the new one is policy-checked
 * before any write.
 */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  currentPassword: string;

  @IsPassword()
  newPassword: string;
}
