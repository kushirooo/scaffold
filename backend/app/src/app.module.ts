import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { createObserveModule } from '@nestjs/observe';
import { AccountsModule } from './accounts/accounts.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { CsrfGuard } from './auth/guards/csrf.guard.js';
import { validateEnvironment } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PrismaService } from './prisma/prisma.service.js';
import { ProjectsModule } from './projects/projects.module.js';
import { UserManagementModule } from './users/user-management.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule({
  // Observe proxies provider instances; the Prisma client keeps internal
  // private state that a proxy wrapper cannot satisfy. Skipping the client
  // keeps prototype-level instrumentation everywhere else without breaking
  // queries.
  skipInstrumentation: (instance: unknown) => instance instanceof PrismaService,
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    // In-process domain events (US18 `account.created` seam). Listeners never
    // throw, so a failing welcome email cannot fail the creating request.
    EventEmitterModule.forRoot(),
    PrismaModule,
    AuthModule,
    AccountsModule,
    UserManagementModule,
    ProjectsModule,
    HealthModule,
    NotificationsModule,
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? '',
      appSecret: process.env.OBSERVE_APP_SECRET ?? '',
      runtimeMetrics: !process.versions?.['webcontainer'],
      serviceId: 'raf-consult-pms',
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global CSRF defence: every non-GET request needs `X-MARS-CSRF: 1`,
    // including login and logout.
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule {}
