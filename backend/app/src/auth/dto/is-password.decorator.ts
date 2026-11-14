import {
  ValidateBy,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import {
  isPasswordAllowed,
  passwordPolicyViolation,
} from '../password-policy.js';

/** Constraint name used by `@IsPassword()`. */
export const IS_PASSWORD = 'isPassword';

/** Fallback for non-string values; string violations use the policy message. */
const PASSWORD_MUST_BE_STRING_MESSAGE = 'Password must be a string';

function messageFor(value: unknown): string {
  if (typeof value !== 'string') {
    return PASSWORD_MUST_BE_STRING_MESSAGE;
  }

  return (
    passwordPolicyViolation(value)?.message ?? PASSWORD_MUST_BE_STRING_MESSAGE
  );
}

/**
 * US19 policy validator, per ADR 0003: validation runs in the DTO before
 * hashing, so an oversized or blocklisted password never reaches argon2.
 * The rules themselves live in `password-policy.ts`.
 */
export function IsPassword(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: IS_PASSWORD,
      validator: {
        validate: (value: unknown): boolean => isPasswordAllowed(value),
        defaultMessage: (args: ValidationArguments): string =>
          messageFor(args.value),
      },
    },
    validationOptions,
  );
}
