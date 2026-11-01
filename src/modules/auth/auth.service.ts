import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { LoginDto, TokenResponseDto } from './dto/auth.dto';
import { JwtPayload } from './jwt.strategy';

// Real hash with the same cost factor, compared against when the email does not exist
// so that response time does not reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', 12);

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<TokenResponseDto> {
    const user = await this.users.findByEmailWithPassword(dto.email);
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      customerId: user.customerId,
    };
    await this.users.touchLastLogin(user.id);
    return {
      accessToken: await this.jwt.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: this.config.get<string>('jwt.expiresIn', '1h'),
    };
  }
}
