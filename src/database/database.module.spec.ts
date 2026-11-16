import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { DatabaseModule } from './database.module';

describe('DatabaseModule', () => {
  it('registra los errores de conexiones inactivas sin lanzar una excepción', async () => {
    const module = await Test.createTestingModule({
      imports: [DatabaseModule],
    }).compile();
    const pool = module.get(Pool);
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(() =>
        pool.emit('error', new Error('Connection terminated')),
      ).not.toThrow();
      expect(log).toHaveBeenCalledWith('PostgreSQL:', 'Connection terminated');
    } finally {
      log.mockRestore();
      await pool.end();
      await module.close();
    }
  });
});
