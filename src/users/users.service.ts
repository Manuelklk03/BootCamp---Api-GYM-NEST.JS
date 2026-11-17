import { ConflictException, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { User } from './user';

@Injectable()
export class UsersService {
  constructor(private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<User | undefined> {
    const result = await this.pool.query<User>(
      'SELECT id, email, password_hash, role FROM users WHERE email = $1',
      [email],
    );
    return result.rows[0];
  }

  async create(email: string, passwordHash: string): Promise<User> {
    try {
      const result = await this.pool.query<User>(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2) RETURNING id, email, password_hash, role`,
        [email, passwordHash],
      );
      return result.rows[0];
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === '23505') {
        throw new ConflictException('Ese correo ya está registrado');
      }
      throw error;
    }
  }
}
