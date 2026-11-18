import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/users/users.service';
import { classRows } from './fixtures/classes';

const createBody = {
  activity: 'Fuerza',
  room: 'Sala 3',
  startsAt: '2026-11-10T18:00:00Z',
  spots: 15,
  trainerId: 4,
};
const createdRow = {
  id: 8,
  activity: 'Fuerza',
  room: 'Sala 3',
  starts_at: new Date('2026-11-10T18:00:00Z'),
  spots: 15,
  trainer_name: 'Rubén Castro',
};
const createdClass = {
  id: 8,
  activity: 'Fuerza',
  room: 'Sala 3',
  startsAt: '2026-11-10T18:00:00.000Z',
  spots: 15,
  trainerName: 'Rubén Castro',
};

const invalidBodies: Array<[string, Record<string, unknown>]> = [
  ['spots cero', { ...createBody, spots: 0 }],
  ['spots decimal', { ...createBody, spots: 1.5 }],
  ['spots como texto', { ...createBody, spots: '15' }],
  ['fecha inválida', { ...createBody, startsAt: 'mañana' }],
  ['activity solo espacios', { ...createBody, activity: '   ' }],
  ['activity demasiado larga', { ...createBody, activity: 'a'.repeat(51) }],
  ['activity no es texto', { ...createBody, activity: 123 }],
  ['room vacía', { ...createBody, room: '   ' }],
  ['room demasiado larga', { ...createBody, room: 'a'.repeat(31) }],
  ['trainerId cero', { ...createBody, trainerId: 0 }],
  ['campo extra', { ...createBody, id: 1 }],
  ['campos obligatorios ausentes', {}],
];

describe('Crear y borrar clases (Pool simulado)', () => {
  let app: INestApplication<App>;
  const query = jest.fn();
  const receptionist = {
    id: 2,
    email: 'recepcion@fitval.com',
    role: 'staff',
  } as const;
  let findById: jest.SpiedFunction<UsersService['findById']>;
  let token: string;
  const client = () =>
    request.agent(app.getHttpServer()).set('Authorization', 'Bearer ' + token);

  beforeEach(async () => {
    query.mockReset();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Pool)
      .useValue({ query })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    token = app.get(JwtService).sign({ sub: receptionist.id });
    findById = jest
      .spyOn(app.get(UsersService), 'findById')
      .mockResolvedValue(receptionist);
  });

  afterEach(async () => {
    await app.close();
  });

  it('exige un token para escribir y mantiene p?blica la lectura', async () => {
    query.mockResolvedValueOnce({ rows: classRows });
    const anonymous = request(app.getHttpServer());
    await anonymous.get('/api/classes').expect(200);
    await anonymous.post('/api/classes').send(createBody).expect(401);
    await anonymous.delete('/api/classes/6').expect(401);
    expect(findById).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('consulta el rol vigente y permite el POST con el mismo token al pasar a staff', async () => {
    findById.mockResolvedValue({ ...receptionist, role: 'member' });
    await client().post('/api/classes').send(createBody).expect(403);
    await client().delete('/api/classes/6').expect(403);
    expect(query).not.toHaveBeenCalled();

    findById.mockResolvedValue(receptionist);
    query
      .mockResolvedValueOnce({ rows: [{ id: 4 }] })
      .mockResolvedValueOnce({ rows: [{ id: 8 }] })
      .mockResolvedValueOnce({ rows: [createdRow] });
    await client()
      .post('/api/classes')
      .send(createBody)
      .expect(201, createdClass);
    expect(findById).toHaveBeenCalledTimes(3);
    expect(findById).toHaveBeenLastCalledWith(receptionist.id);
  });

  it('POST crea una clase, recorta los textos y devuelve el monitor', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 4 }] })
      .mockResolvedValueOnce({ rows: [{ id: 8 }] })
      .mockResolvedValueOnce({ rows: [createdRow] });

    await client()
      .post('/api/classes')
      .send({ ...createBody, activity: '  Fuerza  ', room: ' Sala 3 ' })
      .expect(201)
      .expect(createdClass);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('VALUES ($1, $2, $3, $4, $5)'),
      ['Fuerza', 'Sala 3', createBody.startsAt, 15, 4],
    );
  });

  it.each(invalidBodies)('POST devuelve 400: %s', async (_name, body) => {
    await client().post('/api/classes').send(body).expect(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('POST devuelve 400 si no existe el monitor y no inserta la clase', async () => {
    query.mockResolvedValue({ rows: [] });
    await client()
      .post('/api/classes')
      .send({ ...createBody, trainerId: 99 })
      .expect(400);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      'SELECT id FROM trainers WHERE id = $1',
      [99],
    );
  });

  it('DELETE devuelve la clase borrada y después 404 al repetirlo', async () => {
    query
      .mockResolvedValueOnce({ rows: [createdRow] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 8 }] })
      .mockResolvedValueOnce({ rows: [] });

    await client().delete('/api/classes/8').expect(200).expect(createdClass);
    await client().delete('/api/classes/8').expect(404);
    expect(query).toHaveBeenCalledWith(
      'DELETE FROM classes WHERE id = $1 RETURNING id',
      [8],
    );
  });

  it('DELETE devuelve 409 y no borra si hay reservas', async () => {
    query
      .mockResolvedValueOnce({ rows: [classRows[0]] })
      .mockResolvedValueOnce({ rows: [{ total: 3 }] });
    await client().delete('/api/classes/1').expect(409);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE'),
      expect.anything(),
    );
  });

  it('DELETE devuelve 404 si la clase no existe', async () => {
    query.mockResolvedValue({ rows: [] });
    await client().delete('/api/classes/99').expect(404);
  });

  it('DELETE rechaza un id no numérico antes de consultar PostgreSQL', async () => {
    await client().delete('/api/classes/abc').expect(400);
    expect(query).not.toHaveBeenCalled();
  });
});
