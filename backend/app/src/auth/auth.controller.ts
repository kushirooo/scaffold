import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthCookies } from './auth.cookies.js';
import { AuthService } from './auth.service.js';
import type {
  AuthenticatedUser,
  ChangePasswordResponse,
  LoginResponse,
} from './auth.types.js';
import {
  CurrentSessionId,
  CurrentUser,
} from './decorators/current-user.decorator.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { PasswordRecoveryService } from './password-recovery.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordRecovery: PasswordRecoveryService,
    private readonly cookies: AuthCookies,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.authService.login(dto.email, dto.password);
    this.cookies.setAccessToken(response, result.token);
    return result.response;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentSessionId() sessionId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(sessionId);
    this.cookies.clearAccessToken(response);
  }

  /**
   * US19: always 204, whether or not the email belongs to an active account.
   * The service itself never throws for token/email failures, so this route
   * cannot disclose whether an account exists.
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.passwordRecovery.forgotPassword(dto.email);
  }

  /**
   * US19 §9.1: consumes a single-use RESET/INVITE link. Returns 200 with an
   * empty body and never sets the access-token cookie (no auto-login); every
   * invalid link is the same generic 400 from the service.
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.passwordRecovery.resetPassword(dto.token, dto.newPassword);
  }

  /**
   * US19 §7.7: rotates the session after a password change. The replacement
   * JWT is written to the httpOnly cookie and only there; the old cookie is
   * dead immediately because every session was revoked and tokenVersion moved.
   */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ChangePasswordResponse> {
    const result = await this.passwordRecovery.changePassword(
      user,
      dto.currentPassword,
      dto.newPassword,
    );
    this.cookies.setAccessToken(response, result.token);
    return result.response;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): { user: AuthenticatedUser } {
    return { user };
  }
}
