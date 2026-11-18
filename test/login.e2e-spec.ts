import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { Pool } from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Login y perfil (Pool simulado)', () => {
  let app: INestApplication<App>;
  const query = jest.fn();
  const credentials = { email: 'ana@gym.com', password: '12345678' };
  const profile = { id: 1, email: credentials.email, role: 'member' };
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2.hash(credentials.password);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Pool)
      .useValue({ query })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  beforeEach(() => query.mockReset());
  afterAll(async () => app.close());

  it('emite un JWT con el id y devuelve el perfil con el token', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ ...profile, password_hash: passwordHash }],
      })
      .mockResolvedValueOnce({ rows: [profile] });
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send(credentials)
      .expect(200);
    const { accessToken } = response.body as { accessToken: string };
    const jwt = app.get(JwtService);
    expect(jwt.verify(accessToken)).toEqual({
      sub: profile.id,
      iat: expect.any(Number) as number,
      exp: expect.any(Number) as number,
    });
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .auth(accessToken, { type: 'bearer' })
      .expect(200, profile);
    query.mockResolvedValueOnce({ rows: [] });
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .auth(accessToken, { type: 'bearer' })
      .expect(401);
  });

  it('devuelve el mismo 401 si el correo no existe o falla la contraseña', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [{ ...profile, password_hash: passwordHash }],
    });
    const unknown = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ ...credentials, email: 'otro@gym.com' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ ...credentials, password: 'incorrecta' })
      .expect(401, unknown.body as object);
  });

  it('rechaza peticiones sin token, con firma inválida o con token caducado', async () => {
    const jwt = app.get(JwtService);
    const invalid = jwt.sign({ sub: 1 }, { secret: 'different-test-secret' });
    const expired = jwt.sign({ sub: 1 }, { expiresIn: -1 });
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    for (const token of [invalid, expired]) {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .auth(token, { type: 'bearer' })
        .expect(401);
    }
    expect(query).not.toHaveBeenCalled();
  });
});
