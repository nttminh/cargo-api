import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';
import { paginate, skipOf, TransportMode } from '@cargo/common';
import { EventTypes, OutboxService, Topics } from '@cargo/messaging';
import { Carrier, toCarrierSnapshot } from './carrier.entity';
import { CarrierQueryDto, CreateCarrierDto, UpdateCarrierDto } from './dto/carrier.dto';

const assertCarrier = (c: Pick<Carrier, 'mode' | 'code' | 'awbPrefix'>) => {
  if (c.mode === TransportMode.AIR && !/^[A-Z0-9]{2}$/.test(c.code)) {
    throw new BadRequestException('Airline code must be a 2-character IATA code');
  }
  if (c.mode === TransportMode.SEA) {
    if (!/^[A-Z]{4}$/.test(c.code)) {
      throw new BadRequestException('Ocean carrier code must be a 4-letter SCAC');
    }
    if (c.awbPrefix) throw new BadRequestException('awbPrefix applies to airlines only');
  }
};

@Injectable()
export class CarriersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Carrier) private readonly repo: Repository<Carrier>,
    private readonly outbox: OutboxService,
  ) {}

  async create(dto: CreateCarrierDto) {
    assertCarrier({ ...dto, awbPrefix: dto.awbPrefix ?? null });
    if (await this.repo.exists({ where: { mode: dto.mode, code: dto.code } })) {
      throw new ConflictException(`${dto.mode} carrier ${dto.code} already exists`);
    }
    return this.dataSource.transaction(async (em) => {
      const saved = await em.save(em.create(Carrier, dto));
      return this.published(em, saved.id);
    });
  }

  async findAll(q: CarrierQueryDto) {
    const qb = this.repo
      .createQueryBuilder('c')
      .orderBy('c.name', 'ASC')
      .skip(skipOf(q))
      .take(q.limit);
    if (q.mode) qb.andWhere('c.mode = :mode', { mode: q.mode });
    if (q.search) {
      qb.andWhere(
        new Brackets((w) =>
          w.where('c.code ILIKE :s', { s: `%${q.search}%` }).orWhere('c.name ILIKE :s'),
        ),
      );
    }
    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, q);
  }

  async findOne(id: string) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException(`Carrier ${id} not found`);
    return c;
  }

  async update(id: string, dto: UpdateCarrierDto) {
    return this.dataSource.transaction(async (em) => {
      const c = await em.findOne(Carrier, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!c) throw new NotFoundException(`Carrier ${id} not found`);
      Object.assign(c, dto);
      assertCarrier(c);
      await em.save(c);
      return this.published(em, id);
    });
  }

  /** Re-reads the committed-to-be state and records it for other services, in the same transaction. */
  private async published(em: EntityManager, id: string) {
    const c = await em.findOneByOrFail(Carrier, { id });
    await this.outbox.add(
      em,
      Topics.carriers,
      c.id,
      EventTypes.CarrierUpserted,
      toCarrierSnapshot(c),
    );
    return c;
  }
}
