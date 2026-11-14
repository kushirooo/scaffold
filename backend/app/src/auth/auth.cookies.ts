import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { ACCESS_TOKEN_COOKIE } from './auth.types.js';

type SameSite = 'lax' | 'strict' | 'none';

/**
 * Writes and clears the `mars_at` httpOnly cookie. Flags come from the
 * validated environment so staging (cross-site, secure) and development
 * (same-site, plain HTTP) cannot drift from the boot-time policy.
 */
@Injectable()
export class AuthCookies {
  private readonly options: CookieOptions;

  constructor(config: ConfigService) {
    const ttlSeconds = config.getOrThrow<number>('JWT_TTL_SECONDS');

    this.options = {
      httpOnly: true,
      secure: config.getOrThrow<boolean>('COOKIE_SECURE'),
      sameSite: config.getOrThrow<SameSite>('COOKIE_SAMESITE'),
      path: '/',
      maxAge: ttlSeconds * 1000,
    };
  }

  setAccessToken(response: Response, token: string): void {
    response.cookie(ACCESS_TOKEN_COOKIE, token, this.options);
  }

  clearAccessToken(response: Response): void {
    const { httpOnly, secure, sameSite, path } = this.options;
    response.clearCookie(ACCESS_TOKEN_COOKIE, {
      httpOnly,
      secure,
      sameSite,
      path,
    });
  }
}
