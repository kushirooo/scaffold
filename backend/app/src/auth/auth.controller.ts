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
import type { AuthenticatedUser, LoginResponse } from './auth.types.js';
import {
  CurrentSessionId,
  CurrentUser,
} from './decorators/current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
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

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): { user: AuthenticatedUser } {
    return { user };
  }
}
