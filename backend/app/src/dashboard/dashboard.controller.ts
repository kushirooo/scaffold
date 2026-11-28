import { Controller, Get, UseFilters, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ApiSingleMessageFilter } from '../common/filters/api-single-message.filter.js';
import { DashboardService } from './dashboard.service.js';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
@UseFilters(ApiSingleMessageFilter)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  async getDashboard(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.dashboard.getDashboard(user);
    return { data };
  }
}
