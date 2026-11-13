import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaResetTokensRepository } from '../reset-tokens/prisma-reset-tokens.repository.js';
import { RESET_TOKENS_REPOSITORY } from '../reset-tokens/reset-tokens.repository.js';
import { PrismaSessionsRepository } from '../sessions/prisma-sessions.repository.js';
import { SESSIONS_REPOSITORY } from '../sessions/sessions.repository.js';
import { PrismaUsersRepository } from '../users/prisma-users.repository.js';
import { USERS_REPOSITORY } from '../users/users.repository.js';
import { AuthController } from './auth.controller.js';
import { AuthCookies } from './auth.cookies.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { PasswordHasher } from './password-hasher.js';
import { ResetTokenService } from './reset-token.service.js';

const JWT_ISSUER = 'raf-consult-pms';
const JWT_AUDIENCE = 'raf-consult-portal';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          expiresIn: config.getOrThrow<number>('JWT_TTL_SECONDS'),
        },
        verifyOptions: {
          algorithms: ['HS256'],
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthCookies,
    PasswordHasher,
    JwtAuthGuard,
    { provide: USERS_REPOSITORY, useClass: PrismaUsersRepository },
    { provide: SESSIONS_REPOSITORY, useClass: PrismaSessionsRepository },
    {
      provide: RESET_TOKENS_REPOSITORY,
      useClass: PrismaResetTokensRepository,
    },
    ResetTokenService,
  ],
  exports: [AuthService, JwtAuthGuard, ResetTokenService],
})
export class AuthModule {}
