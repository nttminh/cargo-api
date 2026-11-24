import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocationType, TransportMode } from '@cargo/common';
import {
  CarrierSnapshot,
  CustomerSnapshot,
  EventConsumer,
  EventEnvelope,
  KafkaClient,
  LocationSnapshot,
  Topics,
  upsertReplica,
} from '@cargo/messaging';
import { CarrierRef, CustomerRef, LocationRef } from './refs.entities';

/** Keeps the customer, location and carrier copies in sync with master-data. */
@Injectable()
export class MasterDataConsumer extends EventConsumer {
  protected readonly groupId = 'shipments';
  protected readonly handlers = {
    [Topics.customers]: async (e: EventEnvelope) => {
      const c = e.data as CustomerSnapshot;
      await upsertReplica(this.customers, {
        id: c.id,
        sourceVersion: c.version,
        code: c.code,
        companyName: c.companyName,
        countryCode: c.countryCode,
        isActive: c.isActive,
      });
    },
    [Topics.locations]: async (e: EventEnvelope) => {
      const l = e.data as LocationSnapshot;
      await upsertReplica(this.locations, {
        id: l.id,
        sourceVersion: l.version,
        type: l.type as LocationType,
        code: l.code,
        name: l.name,
        city: l.city,
        countryCode: l.countryCode,
        timezone: l.timezone,
        latitude: l.latitude,
        longitude: l.longitude,
        isActive: l.isActive,
      });
    },
    [Topics.carriers]: async (e: EventEnvelope) => {
      const c = e.data as CarrierSnapshot;
      await upsertReplica(this.carriers, {
        id: c.id,
        sourceVersion: c.version,
        mode: c.mode as TransportMode,
        code: c.code,
        name: c.name,
        awbPrefix: c.awbPrefix,
        isActive: c.isActive,
      });
    },
  };

  constructor(
    kafka: KafkaClient,
    @InjectRepository(CustomerRef) private readonly customers: Repository<CustomerRef>,
    @InjectRepository(LocationRef) private readonly locations: Repository<LocationRef>,
    @InjectRepository(CarrierRef) private readonly carriers: Repository<CarrierRef>,
  ) {
    super(kafka);
  }
}
