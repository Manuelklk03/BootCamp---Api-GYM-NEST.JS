import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { GymClass, GymClassRow, toGymClass } from './gym-class';
import { CreateClassDto } from './dto/create-class.dto';

const classQuery = `SELECT c.id, c.activity, c.room, c.starts_at, c.spots,
  t.name AS trainer_name
  FROM classes c JOIN trainers t ON t.id = c.trainer_id`;

@Injectable()
export class ClassesService {
  constructor(private readonly pool: Pool) {}

  async findAll(activity?: string): Promise<GymClass[]> {
    const result = activity
      ? await this.pool.query<GymClassRow>(
          `${classQuery} WHERE c.activity ILIKE '%' || $1 || '%' ORDER BY c.starts_at`,
          [activity],
        )
      : await this.pool.query<GymClassRow>(
          `${classQuery} ORDER BY c.starts_at`,
        );
    return result.rows.map(toGymClass);
  }

  async findOne(id: number): Promise<GymClass> {
    const result = await this.pool.query<GymClassRow>(
      `${classQuery} WHERE c.id = $1`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException('No existe ninguna clase con ese id');
    }
    return toGymClass(result.rows[0]);
  }

  async create(dto: CreateClassDto): Promise<GymClass> {
    const trainer = await this.pool.query<{ id: number }>(
      'SELECT id FROM trainers WHERE id = $1',
      [dto.trainerId],
    );
    if (trainer.rows.length === 0) {
      throw new BadRequestException(
        'No existe ningún monitor con ese trainerId',
      );
    }

    const result = await this.pool.query<{ id: number }>(
      `INSERT INTO classes (activity, room, starts_at, spots, trainer_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [dto.activity, dto.room, dto.startsAt, dto.spots, dto.trainerId],
    );
    return this.findOne(result.rows[0].id);
  }

  async remove(id: number): Promise<GymClass> {
    const gymClass = await this.findOne(id);
    const bookings = await this.pool.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM bookings WHERE class_id = $1',
      [id],
    );
    if (bookings.rows[0].total > 0) {
      throw new ConflictException('No se puede borrar una clase con reservas');
    }

    const result = await this.pool.query<{ id: number }>(
      'DELETE FROM classes WHERE id = $1 RETURNING id',
      [id],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException('No existe ninguna clase con ese id');
    }
    return gymClass;
  }
}
