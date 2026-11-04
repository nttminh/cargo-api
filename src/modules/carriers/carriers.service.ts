import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Carrier } from './carrier.entity';
import { CarrierQueryDto, CreateCarrierDto, UpdateCarrierDto } from './dto/carrier.dto';
import { paginate, skipOf } from '../../common/dto/pagination.dto';
import { TransportMode } from '../../common/enums';

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
  constructor(@InjectRepository(Carrier) private readonly repo: Repository<Carrier>) {}

  async create(dto: CreateCarrierDto) {
    assertCarrier({ ...dto, awbPrefix: dto.awbPrefix ?? null });
    if (await this.repo.exists({ where: { mode: dto.mode, code: dto.code } })) {
      throw new ConflictException(`${dto.mode} carrier ${dto.code} already exists`);
    }
    return this.repo.save(this.repo.create(dto));
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
    const c = await this.findOne(id);
    Object.assign(c, dto);
    assertCarrier(c);
    return this.repo.save(c);
  }
}
