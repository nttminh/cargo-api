import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Location } from './location.entity';
import { CreateLocationDto, LocationQueryDto, UpdateLocationDto } from './dto/location.dto';
import { paginate, skipOf } from '../../common/dto/pagination.dto';
import { LocationType } from '../../common/enums';

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
  constructor(@InjectRepository(Location) private readonly repo: Repository<Location>) {}

  async create(dto: CreateLocationDto) {
    assertLocationCode(dto.type, dto.code);
    if (await this.repo.exists({ where: { type: dto.type, code: dto.code } })) {
      throw new ConflictException(`${dto.type} ${dto.code} already exists`);
    }
    return this.repo.save(this.repo.create(dto));
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
    const l = await this.findOne(id);
    Object.assign(l, dto);
    assertLocationCode(l.type, l.code);
    return this.repo.save(l);
  }
}
