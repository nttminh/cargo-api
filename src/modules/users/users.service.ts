import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './user.entity';
import { ChangePasswordDto, CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { paginate, PaginationQueryDto, skipOf } from '../../common/dto/pagination.dto';
import { UserRole } from '../../common/enums';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  static hashPassword(plain: string) {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  }

  async create(dto: CreateUserDto): Promise<User> {
    if (dto.role === UserRole.CUSTOMER && !dto.customerId) {
      throw new BadRequestException('customerId is required for CUSTOMER users');
    }
    if (await this.repo.exists({ where: { email: dto.email } })) {
      throw new ConflictException('Email already registered');
    }
    const user = this.repo.create({
      email: dto.email,
      fullName: dto.fullName,
      role: dto.role,
      customerId: dto.role === UserRole.CUSTOMER ? dto.customerId : null,
      passwordHash: await UsersService.hashPassword(dto.password),
    });
    const saved = await this.repo.save(user);
    return this.findOne(saved.id);
  }

  async findAll(q: PaginationQueryDto) {
    const where = q.search
      ? [{ email: ILike(`%${q.search}%`) }, { fullName: ILike(`%${q.search}%`) }]
      : {};
    const [data, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: skipOf(q),
      take: q.limit,
    });
    return paginate(data, total, q);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  /** Includes the password hash. For authentication only. */
  findByEmailWithPassword(email: string) {
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .getOne();
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    Object.assign(user, dto);
    if (user.role !== UserRole.CUSTOMER) user.customerId = null;
    else if (!user.customerId)
      throw new BadRequestException('customerId is required for CUSTOMER users');
    await this.repo.save(user);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const res = await this.repo.delete(id);
    if (!res.affected) throw new NotFoundException(`User ${id} not found`);
  }

  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.repo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id })
      .getOne();
    if (!user || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.repo.update(id, { passwordHash: await UsersService.hashPassword(dto.newPassword) });
  }

  touchLastLogin(id: string) {
    return this.repo.update(id, { lastLoginAt: new Date() });
  }
}
