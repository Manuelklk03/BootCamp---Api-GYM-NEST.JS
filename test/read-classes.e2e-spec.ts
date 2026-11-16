import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { classRows } from './fixtures/classes';

describe('Lectura de planes y clases (Pool simulado)', () => {
  let app: INestApplication<App>;
  const query = jest.fn();

  beforeEach(async () => {
    query.mockReset();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Pool)
      .useValue({ query })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/plans devuelve cuatro planes con precios numéricos', async () => {
    query.mockResolvedValue({
      rows: [
        { id: 4, name: 'Mañanas', monthly_price: '19.90' },
        { id: 3, name: 'Estudiante', monthly_price: '24.90' },
        { id: 1, name: 'Básico', monthly_price: '29.90' },
        { id: 2, name: 'Completo', monthly_price: '44.90' },
      ],
    });
    const response = await request(app.getHttpServer())
      .get('/api/plans')
      .expect(200);
    expect(response.body).toEqual([
      { id: 4, name: 'Mañanas', monthlyPrice: 19.9 },
      { id: 3, name: 'Estudiante', monthlyPrice: 24.9 },
      { id: 1, name: 'Básico', monthlyPrice: 29.9 },
      { id: 2, name: 'Completo', monthlyPrice: 44.9 },
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY monthly_price'),
    );
  });

  it('GET /api/classes devuelve siete clases con monitor y fecha ISO', async () => {
    query.mockResolvedValue({ rows: classRows });
    const response = await request(app.getHttpServer())
      .get('/api/classes')
      .expect(200);
    expect(response.body).toHaveLength(7);
    expect(response.body).toEqual(
      expect.arrayContaining([
        {
          id: 1,
          activity: 'Spinning',
          room: 'Sala 1',
          startsAt: '2026-11-02T09:00:00.000Z',
          spots: 12,
          trainerName: 'Carla Navarro',
        },
      ]),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY c.starts_at'),
    );
  });

  it.each([
    ['yoga', [classRows[1], classRows[5]]],
    ['SPIN', [classRows[0], classRows[3]]],
  ])('parametriza el filtro activity=%s con ILIKE', async (activity, rows) => {
    query.mockResolvedValue({ rows });
    const response = await request(app.getHttpServer())
      .get('/api/classes')
      .query({ activity })
      .expect(200);
    expect(response.body).toHaveLength(2);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("ILIKE '%' || $1 || '%'"),
      [activity],
    );
  });

  it('GET /api/classes/7 devuelve Crossfit con tres plazas', async () => {
    query.mockResolvedValue({ rows: [classRows[6]] });
    await request(app.getHttpServer())
      .get('/api/classes/7')
      .expect(200)
      .expect({
        id: 7,
        activity: 'Crossfit',
        room: 'Sala 3',
        startsAt: '2026-11-05T20:00:00.000Z',
        spots: 3,
        trainerName: 'Carla Navarro',
      });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE c.id = $1'),
      [7],
    );
  });

  it('rechaza un id no numérico antes de consultar PostgreSQL', async () => {
    await request(app.getHttpServer()).get('/api/classes/abc').expect(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('devuelve 404 cuando no existe la clase', async () => {
    query.mockResolvedValue({ rows: [] });
    await request(app.getHttpServer()).get('/api/classes/99').expect(404);
  });

  it('envía el intento de inyección como parámetro, separado del SQL', async () => {
    const activity = "zzz' OR 1=1 --";
    query.mockResolvedValue({ rows: [] });
    await request(app.getHttpServer())
      .get('/api/classes')
      .query({ activity })
      .expect(200)
      .expect([]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("ILIKE '%' || $1 || '%'"),
      [activity],
    );
    expect(query).toHaveBeenCalledWith(expect.not.stringContaining(activity), [
      activity,
    ]);
  });
});
