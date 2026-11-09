import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../database/database.module.js';
import {
  SESSIONS_REPOSITORY,
} from '../sessions/sessions.repository.js';
import { PostgresSessionsRepository } from '../sessions/postgres-sessions.repository.js';
import { USERS_REPOSITORY } from '../users/users.repository.js';
import { PostgresUsersRepository } from '../users/postgres-users.repository.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { PasswordHasher } from './password-hasher.js';

const JWT_ISSUER = 'raf-consult-pms';
const JWT_AUDIENCE = 'raf-consult-portal';

@Module({
  imports: [
    DatabaseModule,
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
    PasswordHasher,
    JwtAuthGuard,
    { provide: USERS_REPOSITORY, useClass: PostgresUsersRepository },
    { provide: SESSIONS_REPOSITORY, useClass: PostgresSessionsRepository },
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
