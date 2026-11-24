import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike, Repository } from 'typeorm';
import { paginate, PaginationQueryDto, skipOf } from '@cargo/common';
import { EventTypes, OutboxService, Topics } from '@cargo/messaging';
import { Customer, toCustomerSnapshot } from './customer.entity';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Customer) private readonly repo: Repository<Customer>,
    private readonly outbox: OutboxService,
  ) {}

  async create(dto: CreateCustomerDto) {
    if (await this.repo.exists({ where: { code: dto.code } })) {
      throw new ConflictException(`Customer code ${dto.code} already exists`);
    }
    return this.dataSource.transaction(async (em) => {
      const saved = await em.save(em.create(Customer, dto));
      return this.published(em, saved.id);
    });
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
    return this.dataSource.transaction(async (em) => {
      const c = await this.lockForUpdate(em, id);
      Object.assign(c, dto);
      await em.save(c);
      return this.published(em, id);
    });
  }

  /** Soft-deactivate: customers are referenced by historical shipments. */
  async deactivate(id: string) {
    await this.dataSource.transaction(async (em) => {
      const c = await this.lockForUpdate(em, id);
      c.isActive = false;
      await em.save(c);
      await this.published(em, id);
    });
  }

  private async lockForUpdate(em: EntityManager, id: string) {
    const c = await em.findOne(Customer, { where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!c) throw new NotFoundException(`Customer ${id} not found`);
    return c;
  }

  /** Re-reads the committed-to-be state and records it for other services, in the same transaction. */
  private async published(em: EntityManager, id: string) {
    const c = await em.findOneByOrFail(Customer, { id });
    await this.outbox.add(
      em,
      Topics.customers,
      c.id,
      EventTypes.CustomerUpserted,
      toCustomerSnapshot(c),
    );
    return c;
  }
}
