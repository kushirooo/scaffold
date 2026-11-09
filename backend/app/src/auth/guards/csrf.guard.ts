import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { MISSING_CSRF_MESSAGE } from '../auth.types.js';

export const CSRF_HEADER = 'x-mars-csrf';
export const CSRF_HEADER_VALUE = '1';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Minimal CSRF defence for the cookie transport: every state-changing request
 * must carry `X-MARS-CSRF: 1`. Browsers cannot attach custom headers to a
 * cross-site HTML form, and a cross-origin `fetch` that sets one triggers a
 * preflight which the exact-origin CORS policy rejects. There is no CSRF
 * cookie and no exemption — login and logout require the header too.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    if (request.headers[CSRF_HEADER] === CSRF_HEADER_VALUE) {
      return true;
    }

    throw new ForbiddenException(MISSING_CSRF_MESSAGE);
  }
}
