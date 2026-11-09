import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service.js';
import {
  MISSING_TOKEN_MESSAGE,
  type AccessTokenPayload,
  type AuthenticatedRequest,
} from '../auth.types.js';
import { USER_ROLES } from '../../users/user.types.js';

const INVALID_TOKEN_MESSAGE = 'Invalid or expired access token';

function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as Partial<AccessTokenPayload>;
  return (
    typeof payload.sub === 'string' &&
    typeof payload.sid === 'string' &&
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
    const token = extractBearerToken(request.headers.authorization);

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
