import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import type { AuthenticatedRequest } from './jwt-payload';

@Injectable()
export class StaffGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.usersService.findById(request.user.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.role !== 'staff') {
      throw new ForbiddenException('Solo para el personal del gimnasio');
    }
    return true;
  }
}
