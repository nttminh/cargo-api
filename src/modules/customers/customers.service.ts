import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Customer } from './customer.entity';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { paginate, PaginationQueryDto, skipOf } from '../../common/dto/pagination.dto';

@Injectable()
export class CustomersService {
  constructor(@InjectRepository(Customer) private readonly repo: Repository<Customer>) {}

  async create(dto: CreateCustomerDto) {
    if (await this.repo.exists({ where: { code: dto.code } })) {
      throw new ConflictException(`Customer code ${dto.code} already exists`);
    }
    return this.repo.save(this.repo.create(dto));
  }

  async findAll(q: PaginationQueryDto) {
    const where = q.search
      ? [
          { companyName: ILike(`%${q.search}%`) },
          { code: ILike(`%${q.search}%`) },
          { email: ILike(`%${q.search}%`) },
        ]
      : {};
    const [data, total] = await this.repo.findAndCount({
      where,
      order: { companyName: 'ASC' },
      skip: skipOf(q),
      take: q.limit,
    });
    return paginate(data, total, q);
  }

  async findOne(id: string) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException(`Customer ${id} not found`);
    return c;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const c = await this.findOne(id);
    Object.assign(c, dto);
    return this.repo.save(c);
  }

  /** Soft-deactivate: customers are referenced by historical shipments. */
  async deactivate(id: string) {
    const c = await this.findOne(id);
    c.isActive = false;
    await this.repo.save(c);
  }
}
