import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app, moduleFixture.get(ConfigService));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health reports the database is up', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok', db: 'up' });
  });
});
