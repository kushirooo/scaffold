import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

/**
 * Shared HTTP setup for the real server and the e2e suite, so tests exercise
 * exactly the cookie parsing, validation and CORS behaviour that ships.
 */
export function configureApp(
  app: INestApplication,
  config: ConfigService,
): void {
  // Railway/Vercel terminate TLS in front of the API. Trusting one proxy hop
  // keeps `secure` cookie handling and client IPs correct.
  (app as NestExpressApplication).set('trust proxy', 1);

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const origins = config.getOrThrow<string[]>('CORS_ORIGINS');

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-MARS-CSRF'],
    maxAge: 600,
  });
}
