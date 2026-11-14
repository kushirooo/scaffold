import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import {
  MISSING_TOKEN_MESSAGE,
  type AuthenticatedRequest,
  type AuthenticatedUser,
} from '../auth.types.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new UnauthorizedException(MISSING_TOKEN_MESSAGE);
    }
    return request.user;
  },
);

export const CurrentSessionId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.sessionId) {
      throw new UnauthorizedException(MISSING_TOKEN_MESSAGE);
    }
    return request.sessionId;
  },
);
