import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { Pool } from 'pg';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const query = jest.fn();

  beforeEach(async () => {
    query.mockReset();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(Pool)
      .useValue({ query })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useLogger(false);
    await app.init();
  });

  it('/api/health (GET) devuelve el nombre de la base de datos', () => {
    query.mockResolvedValue({ rows: [{ database: 'fitval' }] });

    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok', database: 'fitval' });
  });

  it('oculta los detalles del error y vuelve a responder tras recuperarse la base de datos', async () => {
    query
      .mockRejectedValueOnce(
        new Error('ECONNREFUSED: private database details'),
      )
      .mockResolvedValueOnce({ rows: [{ database: 'fitval' }] });

    await request(app.getHttpServer())
      .get('/api/health')
      .expect(500)
      .expect({ statusCode: 500, message: 'Internal server error' });

    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok', database: 'fitval' });
  });

  afterEach(async () => {
    await app.close();
  });
});
