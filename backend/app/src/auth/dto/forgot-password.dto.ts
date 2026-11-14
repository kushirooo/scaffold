import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

/**
 * US19 forgot-password request. The email is trimmed here; the repository
 * lowercases it before the lookup, matching the login normalisation.
 */
export class ForgotPasswordDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;
}
