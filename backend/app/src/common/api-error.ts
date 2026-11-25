import { HttpException } from '@nestjs/common';

/**
 * A contract-shaped HTTP error. The response carries `code` and `message`;
 * the error filter adds `statusCode` and `error`.
 */
export function apiError(
  status: number,
  code: string,
  message: string,
): HttpException {
  return new HttpException({ code, message }, status);
}
