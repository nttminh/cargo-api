import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';
import { LocationType, paginate, skipOf } from '@cargo/common';
import { EventTypes, OutboxService, Topics } from '@cargo/messaging';
import { Location, toLocationSnapshot } from './location.entity';
import { CreateLocationDto, LocationQueryDto, UpdateLocationDto } from './dto/location.dto';

const CODE_FORMAT: Record<LocationType, RegExp> = {
  [LocationType.AIRPORT]: /^[A-Z]{3}$/, // IATA
  [LocationType.SEAPORT]: /^[A-Z]{2}[A-Z2-9]{3}$/, // UN/LOCODE
};

export const assertLocationCode = (type: LocationType, code: string) => {
  if (!CODE_FORMAT[type].test(code)) {
    throw new BadRequestException(
      type === LocationType.AIRPORT
        ? 'Airport code must be a 3-letter IATA code'
        : 'Seaport code must be a 5-character UN/LOCODE',
    );
  }
};

@Injectable()
export class LocationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Location) private readonly repo: Repository<Location>,
    private readonly outbox: OutboxService,
  ) {}

  async create(dto: CreateLocationDto) {
    assertLocationCode(dto.type, dto.code);
    if (await this.repo.exists({ where: { type: dto.type, code: dto.code } })) {
      throw new ConflictException(`${dto.type} ${dto.code} already exists`);
    }
    return this.dataSource.transaction(async (em) => {
      const saved = await em.save(em.create(Location, dto));
      return this.published(em, saved.id);
    });
  }

  async findAll(q: LocationQueryDto) {
    const qb = this.repo
      .createQueryBuilder('l')
      .orderBy('l.code', 'ASC')
      .skip(skipOf(q))
      .take(q.limit);
    if (q.type) qb.andWhere('l.type = :type', { type: q.type });
    if (q.countryCode) qb.andWhere('l.countryCode = :cc', { cc: q.countryCode });
    if (q.search) {
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('l.code ILIKE :s', { s: `%${q.search}%` })
            .orWhere('l.name ILIKE :s')
            .orWhere('l.city ILIKE :s'),
        ),
      );
    }
    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, q);
  }

  async findOne(id: string) {
    const l = await this.repo.findOne({ where: { id } });
    if (!l) throw new NotFoundException(`Location ${id} not found`);
    return l;
  }

  async update(id: string, dto: UpdateLocationDto) {
    return this.dataSource.transaction(async (em) => {
      const l = await em.findOne(Location, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!l) throw new NotFoundException(`Location ${id} not found`);
      Object.assign(l, dto);
      assertLocationCode(l.type, l.code);
      await em.save(l);
      return this.published(em, id);
    });
  }

  /** Re-reads the committed-to-be state and records it for other services, in the same transaction. */
  private async published(em: EntityManager, id: string) {
    const l = await em.findOneByOrFail(Location, { id });
    await this.outbox.add(
      em,
      Topics.locations,
      l.id,
      EventTypes.LocationUpserted,
      toLocationSnapshot(l),
    );
    return l;
  }
}
