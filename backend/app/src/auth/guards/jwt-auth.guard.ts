import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service.js';
import {
  ACCESS_TOKEN_COOKIE,
  INVALID_TOKEN_MESSAGE,
  MISSING_TOKEN_MESSAGE,
  type AccessTokenPayload,
  type AuthenticatedRequest,
} from '../auth.types.js';
import { USER_ROLES } from '../../users/user.types.js';

/**
 * Reads the signed access token from the httpOnly `mars_at` cookie. There is
 * deliberately no header-token fallback: one transport, one trust model.
 */
function extractAccessToken(request: AuthenticatedRequest): string | null {
  const cookies: Record<string, unknown> | undefined = request.cookies;
  const token = cookies?.[ACCESS_TOKEN_COOKIE];

  return typeof token === 'string' && token.length > 0 ? token : null;
}

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as Partial<AccessTokenPayload>;
  return (
    typeof payload.sub === 'string' &&
    typeof payload.sid === 'string' &&
    typeof payload.tv === 'number' &&
    Number.isInteger(payload.tv) &&
    typeof payload.email === 'string' &&
    typeof payload.role === 'string' &&
    (USER_ROLES as readonly string[]).includes(payload.role)
  );
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractAccessToken(request);

    if (!token) {
      throw new UnauthorizedException(MISSING_TOKEN_MESSAGE);
    }

    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(token);
    } catch {
      throw new UnauthorizedException(INVALID_TOKEN_MESSAGE);
    }

    if (!isAccessTokenPayload(payload)) {
      throw new UnauthorizedException(INVALID_TOKEN_MESSAGE);
    }

    const principal = await this.authService.resolveSession(payload);
    request.user = principal.user;
    request.sessionId = principal.sessionId;

    return true;
  }
}
