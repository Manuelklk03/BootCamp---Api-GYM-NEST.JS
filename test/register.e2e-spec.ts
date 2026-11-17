import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { Pool } from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

const registration = { email: 'ana@gym.com', password: '12345678' };
const existingUser = {
  id: 1,
  email: registration.email,
  password_hash: 'hash no utilizado por esta prueba',
  role: 'member',
};
const invalidBodies: Array<[string, Record<string, unknown>]> = [
  ['correo inválido', { ...registration, email: 'ana' }],
  ['contraseña corta', { ...registration, password: '123' }],
  ['contraseña no es texto', { ...registration, password: 12345678 }],
  ['faltan campos', {}],
  ['rol enviado por el cliente', { ...registration, role: 'staff' }],
  ['campo desconocido', { ...registration, id: 10 }],
];

describe('Registro de usuarios (Pool simulado, Argon2 real)', () => {
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
    app.useLogger(false);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('guarda un hash Argon2id y responde 201 sin contraseña ni hash', async () => {
    let storedPasswordHash: string | undefined;
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockImplementationOnce((_sql: string, values: unknown[]) => {
        const passwordHash = values[1];
        if (typeof passwordHash !== 'string') {
          throw new Error('El INSERT debe recibir un hash');
        }
        storedPasswordHash = passwordHash;
        return Promise.resolve({
          rows: [{ ...existingUser, password_hash: passwordHash }],
        });
      });

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(registration)
      .expect(201)
      .expect({ id: 1, email: registration.email, role: 'member' });

    if (!storedPasswordHash) {
      throw new Error('No se guardó el hash de la contraseña');
    }
    expect(storedPasswordHash).toMatch(/^\$argon2id\$/);
    expect(storedPasswordHash).not.toBe(registration.password);
    expect(await argon2.verify(storedPasswordHash, registration.password)).toBe(
      true,
    );
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('WHERE email = $1'),
      [registration.email],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO users (email, password_hash)'),
      [registration.email, storedPasswordHash],
    );
  });

  it('responde 409 si el correo ya está registrado, sin insertar otro usuario', async () => {
    query.mockResolvedValue({ rows: [existingUser] });
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(registration)
      .expect(409);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each(invalidBodies)('responde 400: %s', async (_name, body) => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(body)
      .expect(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('traduce el conflicto UNIQUE de dos registros simultáneos a 409', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(registration)
      .expect(409);
  });

  it('no confunde un fallo interno de PostgreSQL con un correo duplicado', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('private database details'));
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(registration)
      .expect(500)
      .expect({ statusCode: 500, message: 'Internal server error' });
  });
});
