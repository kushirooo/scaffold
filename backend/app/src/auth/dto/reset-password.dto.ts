import { IsString, MaxLength, MinLength } from 'class-validator';
import { IsPassword } from './is-password.decorator.js';

/**
 * US19 reset request: the opaque single-use token from the link, plus the new
 * password checked against the agreed policy before any token is consumed.
 */
export class ResetPasswordDto {
  /** 43-character base64url in practice; 1-256 keeps the boundary explicit. */
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  token: string;

  @IsPassword()
  newPassword: string;
}
