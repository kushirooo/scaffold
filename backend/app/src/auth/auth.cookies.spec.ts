import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthCookies } from './auth.cookies.js';
import { ACCESS_TOKEN_COOKIE } from './auth.types.js';

const TTL_SECONDS = 3600;

function createCookies(overrides: Record<string, unknown> = {}): AuthCookies {
  return new AuthCookies(
    new ConfigService({
      JWT_TTL_SECONDS: TTL_SECONDS,
      COOKIE_SECURE: false,
      COOKIE_SAMESITE: 'lax',
      ...overrides,
    }),
  );
}

function createResponseMock() {
  const cookie = vi.fn();
  const clearCookie = vi.fn();

  return {
    response: { cookie, clearCookie } as unknown as Response,
    cookie,
    clearCookie,
  };
}

describe('AuthCookies', () => {
  describe('development (secure=false, sameSite=lax)', () => {
    it('sets mars_at as httpOnly, path-wide, lax and non-secure', () => {
      const { response, cookie } = createResponseMock();

      createCookies().setAccessToken(response, 'signed-jwt');

      expect(cookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, 'signed-jwt', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: TTL_SECONDS * 1000,
      });
    });

    it('clears mars_at with the same flags, without a max age', () => {
      const { response, clearCookie } = createResponseMock();

      createCookies().clearAccessToken(response);

      expect(clearCookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      });
    });
  });

  describe('production-like (secure=true, sameSite=none)', () => {
    it('sets a secure, cross-site cookie with the configured lifetime', () => {
      const { response, cookie } = createResponseMock();

      createCookies({
        COOKIE_SECURE: true,
        COOKIE_SAMESITE: 'none',
        JWT_TTL_SECONDS: 900,
      }).setAccessToken(response, 'signed-jwt');

      expect(cookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, 'signed-jwt', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
        maxAge: 900 * 1000,
      });
    });

    it('clears mars_at with secure and sameSite=none', () => {
      const { response, clearCookie } = createResponseMock();

      createCookies({
        COOKIE_SECURE: true,
        COOKIE_SAMESITE: 'none',
      }).clearAccessToken(response);

      expect(clearCookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
      });
    });
  });
});
