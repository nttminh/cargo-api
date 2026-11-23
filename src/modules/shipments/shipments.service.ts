import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';
import { Shipment } from './entities/shipment.entity';
import { ShipmentPackage } from './entities/shipment-package.entity';
import { ShipmentContainer } from './entities/shipment-container.entity';
import { TrackingEvent } from './entities/tracking-event.entity';
import {
  ContainerDto,
  CreateShipmentDto,
  CreateTrackingEventDto,
  PackageDto,
  ShipmentQueryDto,
  UpdateShipmentDto,
  UpdateStatusDto,
} from './dto/shipment.dto';
import { calculateFreight } from './domain/freight-calculator';
import {
  canTransition,
  LOCKED_FOR_EDIT,
  SHIPMENT_TRANSITIONS,
} from './domain/shipment-status.machine';
import { isValidAwbNumber, normalizeAwb } from './domain/validators';
import { Location } from '../locations/location.entity';
import { Carrier } from '../carriers/carrier.entity';
import { Customer } from '../customers/customer.entity';
import { AuthUser } from '../../common/decorators';
import {
  LoadType,
  LocationType,
  ShipmentStatus,
  TransportMode,
  UserRole,
} from '../../common/enums';
import { paginate, skipOf } from '../../common/dto/pagination.dto';
import { ScheduleTimeDto } from '../../common/time/validation';
import { fromInstant, fromLocal, ZonedTime, ZonedTimeError } from '../../common/time/zoned-time';

/** Fields the shipment is validated against, whether new or merged with an update. */
interface ShipmentDraft {
  mode: TransportMode;
  loadType?: LoadType | null;
  originId: string;
  destinationId: string;
  carrierId?: string | null;
  masterDocumentNo?: string | null;
  flightNumber?: string | null;
  vesselName?: string | null;
  voyageNumber?: string | null;
  containers?: ContainerDto[] | null;
  currency?: string | null;
  declaredValue?: number | null;
}

const STATUS_DESCRIPTIONS: Record<ShipmentStatus, string> = {
  [ShipmentStatus.DRAFT]: 'Shipment created',
  [ShipmentStatus.BOOKED]: 'Booking confirmed with carrier',
  [ShipmentStatus.RECEIVED]: 'Cargo received at origin',
  [ShipmentStatus.DEPARTED]: 'Departed from origin',
  [ShipmentStatus.IN_TRANSIT]: 'In transit',
  [ShipmentStatus.ARRIVED]: 'Arrived at destination',
  [ShipmentStatus.CUSTOMS_HOLD]: 'Held by customs',
  [ShipmentStatus.CUSTOMS_CLEARED]: 'Customs cleared',
  [ShipmentStatus.OUT_FOR_DELIVERY]: 'Out for delivery',
  [ShipmentStatus.DELIVERED]: 'Delivered',
  [ShipmentStatus.CANCELLED]: 'Shipment cancelled',
};

/** API sort keys -> entity properties (ETD/ETA sort by their UTC instant). */
const SORT_COLUMNS: Record<ShipmentQueryDto['sortBy'], string> = {
  createdAt: 'createdAt',
  etd: 'etdUtc',
  eta: 'etaUtc',
  reference: 'reference',
};

@Injectable()
export class ShipmentsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Shipment) private readonly repo: Repository<Shipment>,
    @InjectRepository(TrackingEvent) private readonly events: Repository<TrackingEvent>,
  ) {}

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  async create(dto: CreateShipmentDto, user: AuthUser): Promise<Shipment> {
    const customerId = user.role === UserRole.CUSTOMER ? user.customerId : dto.customerId;
    if (!customerId) throw new BadRequestException('customerId is required');

    const id = await this.dataSource.transaction(async (em) => {
      const customer = await em.findOne(Customer, { where: { id: customerId } });
      if (!customer || !customer.isActive) {
        throw new UnprocessableEntityException('Customer not found or inactive');
      }

      const loadType = this.resolveLoadType(dto.mode, dto.loadType);
      const draft: ShipmentDraft = { ...dto, loadType };
      const { origin, destination } = await this.validateDraft(em, draft);
      const etd = this.resolveSchedule(dto.etd, origin, 'etd') ?? null;
      const eta = this.resolveSchedule(dto.eta, destination, 'eta') ?? null;
      this.assertScheduleOrder(etd, eta);

      const reference = await this.nextReference(em, dto.mode);

      const shipment = em.create(Shipment, {
        reference,
        mode: dto.mode,
        loadType,
        status: ShipmentStatus.DRAFT,
        customerId,
        shipper: dto.shipper,
        consignee: dto.consignee,
        notifyParty: dto.notifyParty ?? null,
        originId: dto.originId,
        destinationId: dto.destinationId,
        carrierId: dto.carrierId ?? null,
        incoterm: dto.incoterm ?? null,
        masterDocumentNo: this.normalizeMasterDoc(dto.mode, dto.masterDocumentNo),
        houseDocumentNo: dto.houseDocumentNo ?? null,
        flightNumber: dto.flightNumber ?? null,
        vesselName: dto.vesselName ?? null,
        voyageNumber: dto.voyageNumber ?? null,
        commodityDescription: dto.commodityDescription,
        declaredValue: dto.declaredValue ?? null,
        currency: dto.currency ?? null,
        specialInstructions: dto.specialInstructions ?? null,
        createdById: user.id,
        ...this.totalsFor(dto.mode, dto.packages),
        isHazardous: dto.packages.some((p) => p.isHazardous),
        packages: dto.packages.map((p) => this.toPackage(p)),
        containers: (dto.containers ?? []).map((c) => this.toContainer(c)),
      });
      shipment.setEtd(etd);
      shipment.setEta(eta);
      const saved = await em.save(shipment);

      await em.save(
        em.create(TrackingEvent, {
          shipmentId: saved.id,
          status: ShipmentStatus.DRAFT,
          code: 'CREATED',
          description: STATUS_DESCRIPTIONS[ShipmentStatus.DRAFT],
          locationId: dto.originId,
          occurredAt: new Date(),
          isPublic: true,
          createdById: user.id,
        }),
      );
      return saved.id;
    });

    return this.findOne(id, user);
  }

  async update(id: string, dto: UpdateShipmentDto, user: AuthUser): Promise<Shipment> {
    await this.dataSource.transaction(async (em) => {
      const shipment = await em.findOne(Shipment, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!shipment) throw new NotFoundException(`Shipment ${id} not found`);
      if (LOCKED_FOR_EDIT.includes(shipment.status)) {
        throw new ConflictException(
          `Shipment in status ${shipment.status} can no longer be edited`,
        );
      }

      const loadType = dto.loadType
        ? this.resolveLoadType(shipment.mode, dto.loadType)
        : shipment.loadType;
      const containers =
        dto.containers ??
        (await em.find(ShipmentContainer, { where: { shipmentId: id } })).map(
          (c) => c as unknown as ContainerDto,
        );

      const merged: ShipmentDraft = {
        mode: shipment.mode,
        loadType,
        originId: dto.originId ?? shipment.originId,
        destinationId: dto.destinationId ?? shipment.destinationId,
        carrierId: dto.carrierId !== undefined ? dto.carrierId : shipment.carrierId,
        masterDocumentNo: dto.masterDocumentNo ?? shipment.masterDocumentNo,
        flightNumber: dto.flightNumber ?? shipment.flightNumber,
        vesselName: dto.vesselName ?? shipment.vesselName,
        voyageNumber: dto.voyageNumber ?? shipment.voyageNumber,
        containers,
        currency: dto.currency ?? shipment.currency,
        declaredValue: dto.declaredValue ?? shipment.declaredValue,
      };
      const { origin, destination } = await this.validateDraft(em, merged);
      const etd = this.resolveSchedule(dto.etd, origin, 'etd');
      const eta = this.resolveSchedule(dto.eta, destination, 'eta');
      this.assertScheduleOrder(
        etd === undefined ? shipment.etd : etd,
        eta === undefined ? shipment.eta : eta,
      );

      // etd/eta are applied through setEtd/setEta below, not copied as plain fields.
      const { packages, containers: newContainers, ...scalar } = dto;
      delete scalar.etd;
      delete scalar.eta;
      Object.assign(shipment, scalar, { loadType });
      if (etd !== undefined) shipment.setEtd(etd);
      if (eta !== undefined) shipment.setEta(eta);
      if (dto.masterDocumentNo) {
        shipment.masterDocumentNo = this.normalizeMasterDoc(shipment.mode, dto.masterDocumentNo);
      }

      if (packages) {
        await em.delete(ShipmentPackage, { shipmentId: id });
        await em.save(
          packages.map((p) => em.create(ShipmentPackage, { ...this.toPackage(p), shipmentId: id })),
        );
        Object.assign(shipment, this.totalsFor(shipment.mode, packages), {
          isHazardous: packages.some((p) => p.isHazardous),
        });
      }
      if (newContainers) {
        await em.delete(ShipmentContainer, { shipmentId: id });
        await em.save(
          newContainers.map((c) =>
            em.create(ShipmentContainer, { ...this.toContainer(c), shipmentId: id }),
          ),
        );
      }
      // Children were replaced explicitly above; don't let cascade touch them.
      delete shipment.packages;
      delete shipment.containers;
      await em.save(shipment);
    });
    return this.findOne(id, user);
  }

  async changeStatus(id: string, dto: UpdateStatusDto, user: AuthUser): Promise<Shipment> {
    await this.dataSource.transaction(async (em) => {
      const shipment = await em.findOne(Shipment, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!shipment) throw new NotFoundException(`Shipment ${id} not found`);

      if (!canTransition(shipment.status, dto.status)) {
        const allowed = SHIPMENT_TRANSITIONS[shipment.status];
        throw new ConflictException(
          `Cannot change status from ${shipment.status} to ${dto.status}. ` +
            `Allowed: ${allowed.length ? allowed.join(', ') : 'none (terminal status)'}`,
        );
      }
      if (dto.status === ShipmentStatus.BOOKED && !shipment.carrierId) {
        throw new UnprocessableEntityException('A carrier must be assigned before booking');
      }
      if (dto.locationId) await this.mustExist(em, Location, dto.locationId, 'Location');

      const occurredAt = dto.occurredAt ?? new Date();
      if (occurredAt.getTime() > Date.now() + 5 * 60_000) {
        throw new BadRequestException('occurredAt cannot be in the future');
      }

      shipment.status = dto.status;
      if (dto.status === ShipmentStatus.DEPARTED) shipment.atd = occurredAt;
      if (dto.status === ShipmentStatus.ARRIVED) shipment.ata = occurredAt;
      if (dto.status === ShipmentStatus.DELIVERED) shipment.deliveredAt = occurredAt;
      await em.save(shipment);

      await em.save(
        em.create(TrackingEvent, {
          shipmentId: id,
          status: dto.status,
          code: 'STATUS_CHANGE',
          description: dto.description ?? STATUS_DESCRIPTIONS[dto.status],
          locationId: dto.locationId ?? this.defaultEventLocation(shipment, dto.status),
          occurredAt,
          isPublic: true,
          createdById: user.id,
        }),
      );
    });
    return this.findOne(id, user);
  }

  async addEvent(id: string, dto: CreateTrackingEventDto, user: AuthUser) {
    await this.findOne(id, user);
    if (dto.locationId)
      await this.mustExist(this.dataSource.manager, Location, dto.locationId, 'Location');
    const event = this.events.create({
      shipmentId: id,
      status: null,
      code: dto.code,
      description: dto.description,
      locationId: dto.locationId ?? null,
      occurredAt: dto.occurredAt ?? new Date(),
      isPublic: dto.isPublic ?? true,
      createdById: user.id,
    });
    return this.events.save(event);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  async findAll(q: ShipmentQueryDto, user: AuthUser) {
    const qb = this.repo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.origin', 'origin')
      .leftJoinAndSelect('s.destination', 'destination')
      .leftJoinAndSelect('s.carrier', 'carrier')
      .leftJoin('s.customer', 'customer')
      .addSelect(['customer.id', 'customer.code', 'customer.companyName']);

    if (user.role === UserRole.CUSTOMER) {
      qb.andWhere('s.customerId = :cid', { cid: user.customerId });
    } else if (q.customerId) {
      qb.andWhere('s.customerId = :cid', { cid: q.customerId });
    }
    if (q.mode) qb.andWhere('s.mode = :mode', { mode: q.mode });
    if (q.status?.length) qb.andWhere('s.status IN (:...status)', { status: q.status });
    if (q.carrierId) qb.andWhere('s.carrierId = :carrierId', { carrierId: q.carrierId });
    if (q.origin) qb.andWhere('origin.code = :oc', { oc: q.origin });
    if (q.destination) qb.andWhere('destination.code = :dc', { dc: q.destination });
    if (q.etdFrom) qb.andWhere('s.etdUtc >= :etdFrom', { etdFrom: q.etdFrom });
    if (q.etdTo) qb.andWhere('s.etdUtc <= :etdTo', { etdTo: q.etdTo });
    if (q.search) {
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('s.reference ILIKE :s', { s: `%${q.search}%` })
            .orWhere('s.masterDocumentNo ILIKE :s')
            .orWhere('s.houseDocumentNo ILIKE :s')
            .orWhere('s.commodityDescription ILIKE :s')
            .orWhere(`s.shipper->>'name' ILIKE :s`)
            .orWhere(`s.consignee->>'name' ILIKE :s`),
        ),
      );
    }

    const sortColumn = SORT_COLUMNS[q.sortBy];
    qb.orderBy(`s.${sortColumn}`, q.sortOrder, 'NULLS LAST')
      .addOrderBy('s.id', 'ASC')
      .skip(skipOf(q))
      .take(q.limit);

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, q);
  }

  async findOne(id: string, user: AuthUser): Promise<Shipment> {
    const shipment = await this.repo.findOne({
      where: { id },
      relations: {
        origin: true,
        destination: true,
        carrier: true,
        customer: true,
        packages: true,
        containers: true,
      },
    });
    // Return 404 rather than 403 so customers cannot probe other customers' ids.
    if (!shipment || (user.role === UserRole.CUSTOMER && shipment.customerId !== user.customerId)) {
      throw new NotFoundException(`Shipment ${id} not found`);
    }
    return shipment;
  }

  async listEvents(id: string, user: AuthUser) {
    await this.findOne(id, user);
    return this.events.find({
      where: {
        shipmentId: id,
        ...(user.role === UserRole.CUSTOMER ? { isPublic: true } : {}),
      },
      relations: { location: true },
      order: { occurredAt: 'ASC', createdAt: 'ASC' },
    });
  }

  /**
   * Public lookup by reference, house (HAWB/HBL) or master (MAWB/MBL) document number, in that
   * order of precedence. A master document is shared by every house shipment consolidated under
   * it, so a master number that matches several shipments is rejected as ambiguous rather than
   * guessing (which could show one customer's shipment to another).
   */
  async track(trackingNumber: string) {
    const value = trackingNumber.trim().toUpperCase();
    const awb = isValidAwbNumber(value) ? normalizeAwb(value) : value;

    const find = (field: 'reference' | 'houseDocumentNo' | 'masterDocumentNo', values: string[]) =>
      this.repo
        .createQueryBuilder('s')
        .leftJoinAndSelect('s.origin', 'origin')
        .leftJoinAndSelect('s.destination', 'destination')
        .leftJoinAndSelect('s.carrier', 'carrier')
        .where(`s.${field} IN (:...values)`, { values })
        .andWhere('s.status <> :cancelled', { cancelled: ShipmentStatus.CANCELLED })
        .orderBy('s.createdAt', 'DESC')
        .take(2)
        .getMany();

    let matches = await find('reference', [value]);
    if (!matches.length) matches = await find('houseDocumentNo', [value]);
    if (!matches.length) matches = await find('masterDocumentNo', [...new Set([value, awb])]);

    if (!matches.length) throw new NotFoundException('No shipment found for this tracking number');
    if (matches.length > 1) {
      throw new ConflictException(
        'This master document covers several shipments. Track by shipment reference or house document number.',
      );
    }
    const [shipment] = matches;

    const events = await this.events.find({
      where: { shipmentId: shipment.id, isPublic: true },
      relations: { location: true },
      order: { occurredAt: 'DESC', createdAt: 'DESC' },
    });

    const place = (l?: Location | null) =>
      l ? { code: l.code, name: l.name, city: l.city, countryCode: l.countryCode } : null;

    // Deliberately minimal: no parties, values or internal notes on the public endpoint.
    return {
      reference: shipment.reference,
      mode: shipment.mode,
      loadType: shipment.loadType,
      status: shipment.status,
      origin: place(shipment.origin),
      destination: place(shipment.destination),
      carrier: shipment.carrier
        ? { code: shipment.carrier.code, name: shipment.carrier.name }
        : null,
      flightNumber: shipment.flightNumber,
      vesselName: shipment.vesselName,
      voyageNumber: shipment.voyageNumber,
      etd: shipment.etd,
      eta: shipment.eta,
      atd: shipment.atd,
      ata: shipment.ata,
      deliveredAt: shipment.deliveredAt,
      totalPieces: shipment.totalPieces,
      grossWeightKg: shipment.grossWeightKg,
      events: events.map((e) => ({
        code: e.code,
        status: e.status,
        description: e.description,
        location: place(e.location),
        occurredAt: e.occurredAt,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private resolveLoadType(mode: TransportMode, requested?: LoadType | null): LoadType {
    if (mode === TransportMode.AIR) {
      if (requested && requested !== LoadType.LOOSE) {
        throw new BadRequestException('Air shipments use loadType LOOSE');
      }
      return LoadType.LOOSE;
    }
    if (requested === LoadType.LOOSE) {
      throw new BadRequestException('Sea shipments must be FCL or LCL');
    }
    return requested ?? LoadType.LCL;
  }

  private async validateDraft(
    em: EntityManager,
    d: ShipmentDraft,
  ): Promise<{ origin: Location; destination: Location }> {
    if (d.originId === d.destinationId) {
      throw new BadRequestException('Origin and destination must differ');
    }
    const expectedType = d.mode === TransportMode.AIR ? LocationType.AIRPORT : LocationType.SEAPORT;
    const [origin, destination] = await Promise.all([
      this.mustExist(em, Location, d.originId, 'Origin'),
      this.mustExist(em, Location, d.destinationId, 'Destination'),
    ]);
    for (const [label, loc] of [
      ['Origin', origin],
      ['Destination', destination],
    ] as const) {
      if (loc.type !== expectedType) {
        throw new UnprocessableEntityException(
          `${label} ${loc.code} is a ${loc.type}; ${d.mode} shipments require a ${expectedType}`,
        );
      }
      if (!loc.isActive) throw new UnprocessableEntityException(`${label} ${loc.code} is inactive`);
    }

    if (d.carrierId) {
      const carrier = await this.mustExist(em, Carrier, d.carrierId, 'Carrier');
      if (carrier.mode !== d.mode) {
        throw new UnprocessableEntityException(
          `Carrier ${carrier.code} does not operate ${d.mode}`,
        );
      }
      if (!carrier.isActive)
        throw new UnprocessableEntityException(`Carrier ${carrier.code} is inactive`);
      if (
        d.mode === TransportMode.AIR &&
        carrier.awbPrefix &&
        d.masterDocumentNo &&
        !normalizeAwb(d.masterDocumentNo).startsWith(carrier.awbPrefix)
      ) {
        throw new UnprocessableEntityException(
          `MAWB prefix does not match carrier ${carrier.code} (${carrier.awbPrefix})`,
        );
      }
    }

    if (d.mode === TransportMode.AIR) {
      if (d.containers?.length)
        throw new BadRequestException('Containers apply to sea shipments only');
      if (d.vesselName || d.voyageNumber) {
        throw new BadRequestException('vesselName/voyageNumber apply to sea shipments only');
      }
      if (d.masterDocumentNo && !isValidAwbNumber(d.masterDocumentNo)) {
        throw new BadRequestException(
          'masterDocumentNo is not a valid IATA AWB number (e.g. 738-12345675)',
        );
      }
    } else {
      if (d.flightNumber)
        throw new BadRequestException('flightNumber applies to air shipments only');
      if (d.loadType === LoadType.LCL && d.containers && d.containers.length > 1) {
        throw new BadRequestException(
          'An LCL shipment can reference at most one consolidation container',
        );
      }
    }

    if (d.declaredValue != null && !d.currency) {
      throw new BadRequestException('currency is required when declaredValue is set');
    }
    if (d.containers) {
      const numbers = d.containers.map((c) => c.containerNumber);
      if (new Set(numbers).size !== numbers.length) {
        throw new BadRequestException('Duplicate container numbers');
      }
    }
    return { origin, destination };
  }

  /**
   * Turns an ETD/ETA from the API into a ZonedTime at the port: undefined = not sent (keep),
   * null = clear. The zone defaults to the port's IANA time zone.
   */
  private resolveSchedule(
    input: ScheduleTimeDto | null | undefined,
    port: Location,
    field: 'etd' | 'eta',
  ): ZonedTime | null | undefined {
    if (input === undefined) return undefined;
    if (input === null) return null;
    if (input.local !== undefined && input.at !== undefined) {
      throw new BadRequestException(`${field}: send either local or at, not both`);
    }
    const zone = input.timeZone ?? port.timezone;
    try {
      return input.at !== undefined
        ? fromInstant(input.at, zone)
        : fromLocal(input.local as string, zone);
    } catch (e) {
      if (e instanceof ZonedTimeError) throw new BadRequestException(`${field}: ${e.message}`);
      throw e;
    }
  }

  private assertScheduleOrder(etd: ZonedTime | null, eta: ZonedTime | null) {
    if (etd && eta && eta.utc.getTime() < etd.utc.getTime()) {
      throw new BadRequestException('eta must be on or after etd');
    }
  }

  private totalsFor(mode: TransportMode, packages: PackageDto[]) {
    const t = calculateFreight(mode, packages);
    return {
      totalPieces: t.totalPieces,
      grossWeightKg: t.grossWeightKg,
      volumeCbm: t.volumeCbm,
      chargeableWeightKg: t.chargeableWeightKg,
      revenueTons: t.revenueTons,
    };
  }

  private toPackage(p: PackageDto): Partial<ShipmentPackage> {
    return {
      description: p.description,
      packageType: p.packageType,
      quantity: p.quantity,
      weightKg: p.weightKg,
      lengthCm: p.lengthCm ?? null,
      widthCm: p.widthCm ?? null,
      heightCm: p.heightCm ?? null,
      hsCode: p.hsCode ?? null,
      isHazardous: p.isHazardous ?? false,
      unNumber: p.unNumber ?? null,
    };
  }

  private toContainer(c: ContainerDto): Partial<ShipmentContainer> {
    return {
      containerNumber: c.containerNumber,
      containerType: c.containerType,
      sealNumber: c.sealNumber ?? null,
      tareWeightKg: c.tareWeightKg ?? null,
      vgmKg: c.vgmKg ?? null,
      temperatureC: c.temperatureC ?? null,
    };
  }

  private normalizeMasterDoc(mode: TransportMode, value?: string | null) {
    if (!value) return null;
    return mode === TransportMode.AIR ? normalizeAwb(value) : value;
  }

  private defaultEventLocation(s: Shipment, status: ShipmentStatus): string | null {
    switch (status) {
      case ShipmentStatus.RECEIVED:
      case ShipmentStatus.DEPARTED:
        return s.originId;
      case ShipmentStatus.ARRIVED:
      case ShipmentStatus.CUSTOMS_HOLD:
      case ShipmentStatus.CUSTOMS_CLEARED:
        return s.destinationId;
      default:
        return null;
    }
  }

  private async mustExist<T extends { id: string }>(
    em: EntityManager,
    entity: new () => T,
    id: string,
    label: string,
  ): Promise<T> {
    const found = await em.findOne(entity, { where: { id } as never });
    if (!found) throw new UnprocessableEntityException(`${label} ${id} not found`);
    return found;
  }

  /** e.g. AIR-2611-000042: sequence is global, prefix carries mode + yymm. */
  private async nextReference(em: EntityManager, mode: TransportMode): Promise<string> {
    const [{ seq }] = await em.query(`SELECT nextval('shipment_reference_seq') AS seq`);
    const now = new Date();
    const yymm = `${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    return `${mode}-${yymm}-${String(seq).padStart(6, '0')}`;
  }
}
