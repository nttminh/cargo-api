/**
 * Idempotent seed of reference airports, seaports and carriers. Every row it inserts is also
 * published (via the outbox) so the shipments service receives it.
 *   dev:  npm run seed:master-data
 *   prod: node dist/apps/master-data/apps/master-data/src/database/seed.js   (Kubernetes Job)
 *
 * With --republish it also re-publishes every customer, location and carrier: use it to rebuild
 * the Kafka topics (and so the other services' copies) after they were lost or reset.
 */
import { In } from 'typeorm';
import { LocationType, runScript, TransportMode } from '@cargo/common';
import { EventTypes, OutboxService, Topics } from '@cargo/messaging';
import dataSource from './data-source';
import { Customer, toCustomerSnapshot } from '../customers/customer.entity';
import { Location, toLocationSnapshot } from '../locations/location.entity';
import { Carrier, toCarrierSnapshot } from '../carriers/carrier.entity';

type LocationSeed = Pick<Location, 'type' | 'code' | 'name' | 'city' | 'countryCode' | 'timezone'>;
type CarrierSeed = Pick<Carrier, 'mode' | 'code' | 'name'> & { awbPrefix?: string };

const A = LocationType.AIRPORT;
const P = LocationType.SEAPORT;

const LOCATIONS: LocationSeed[] = [
  {
    type: A,
    code: 'SGN',
    name: 'Tan Son Nhat International Airport',
    city: 'Ho Chi Minh City',
    countryCode: 'VN',
    timezone: 'Asia/Ho_Chi_Minh',
  },
  {
    type: A,
    code: 'HAN',
    name: 'Noi Bai International Airport',
    city: 'Hanoi',
    countryCode: 'VN',
    timezone: 'Asia/Ho_Chi_Minh',
  },
  {
    type: A,
    code: 'SIN',
    name: 'Singapore Changi Airport',
    city: 'Singapore',
    countryCode: 'SG',
    timezone: 'Asia/Singapore',
  },
  {
    type: A,
    code: 'HKG',
    name: 'Hong Kong International Airport',
    city: 'Hong Kong',
    countryCode: 'HK',
    timezone: 'Asia/Hong_Kong',
  },
  {
    type: A,
    code: 'PVG',
    name: 'Shanghai Pudong International Airport',
    city: 'Shanghai',
    countryCode: 'CN',
    timezone: 'Asia/Shanghai',
  },
  {
    type: A,
    code: 'NRT',
    name: 'Narita International Airport',
    city: 'Tokyo',
    countryCode: 'JP',
    timezone: 'Asia/Tokyo',
  },
  {
    type: A,
    code: 'FRA',
    name: 'Frankfurt Airport',
    city: 'Frankfurt',
    countryCode: 'DE',
    timezone: 'Europe/Berlin',
  },
  {
    type: A,
    code: 'AMS',
    name: 'Amsterdam Airport Schiphol',
    city: 'Amsterdam',
    countryCode: 'NL',
    timezone: 'Europe/Amsterdam',
  },
  {
    type: A,
    code: 'LAX',
    name: 'Los Angeles International Airport',
    city: 'Los Angeles',
    countryCode: 'US',
    timezone: 'America/Los_Angeles',
  },
  {
    type: A,
    code: 'ORD',
    name: "O'Hare International Airport",
    city: 'Chicago',
    countryCode: 'US',
    timezone: 'America/Chicago',
  },

  {
    type: P,
    code: 'VNSGN',
    name: 'Port of Ho Chi Minh City (Cat Lai)',
    city: 'Ho Chi Minh City',
    countryCode: 'VN',
    timezone: 'Asia/Ho_Chi_Minh',
  },
  {
    type: P,
    code: 'VNHPH',
    name: 'Port of Hai Phong',
    city: 'Hai Phong',
    countryCode: 'VN',
    timezone: 'Asia/Ho_Chi_Minh',
  },
  {
    type: P,
    code: 'SGSIN',
    name: 'Port of Singapore',
    city: 'Singapore',
    countryCode: 'SG',
    timezone: 'Asia/Singapore',
  },
  {
    type: P,
    code: 'CNSHA',
    name: 'Port of Shanghai',
    city: 'Shanghai',
    countryCode: 'CN',
    timezone: 'Asia/Shanghai',
  },
  {
    type: P,
    code: 'HKHKG',
    name: 'Port of Hong Kong',
    city: 'Hong Kong',
    countryCode: 'HK',
    timezone: 'Asia/Hong_Kong',
  },
  {
    type: P,
    code: 'NLRTM',
    name: 'Port of Rotterdam',
    city: 'Rotterdam',
    countryCode: 'NL',
    timezone: 'Europe/Amsterdam',
  },
  {
    type: P,
    code: 'DEHAM',
    name: 'Port of Hamburg',
    city: 'Hamburg',
    countryCode: 'DE',
    timezone: 'Europe/Berlin',
  },
  {
    type: P,
    code: 'USLAX',
    name: 'Port of Los Angeles',
    city: 'Los Angeles',
    countryCode: 'US',
    timezone: 'America/Los_Angeles',
  },
  {
    type: P,
    code: 'USLGB',
    name: 'Port of Long Beach',
    city: 'Long Beach',
    countryCode: 'US',
    timezone: 'America/Los_Angeles',
  },
];

const CARRIERS: CarrierSeed[] = [
  { mode: TransportMode.AIR, code: 'VN', name: 'Vietnam Airlines Cargo', awbPrefix: '738' },
  { mode: TransportMode.AIR, code: 'SQ', name: 'Singapore Airlines Cargo', awbPrefix: '618' },
  { mode: TransportMode.AIR, code: 'CX', name: 'Cathay Cargo', awbPrefix: '160' },
  { mode: TransportMode.AIR, code: 'LH', name: 'Lufthansa Cargo', awbPrefix: '020' },
  { mode: TransportMode.SEA, code: 'MAEU', name: 'Maersk' },
  { mode: TransportMode.SEA, code: 'MSCU', name: 'Mediterranean Shipping Company' },
  { mode: TransportMode.SEA, code: 'CMDU', name: 'CMA CGM' },
  { mode: TransportMode.SEA, code: 'ONEY', name: 'Ocean Network Express' },
  { mode: TransportMode.SEA, code: 'EGLV', name: 'Evergreen Line' },
];

async function seed() {
  const republish = process.argv.includes('--republish');
  const outbox = new OutboxService();
  await dataSource.initialize();
  try {
    await dataSource.transaction(async (em) => {
      // Insert missing rows only; RETURNING yields just the ones actually inserted.
      const loc = await em
        .createQueryBuilder()
        .insert()
        .into(Location)
        .values(LOCATIONS)
        .orIgnore()
        .returning(['id'])
        .execute();
      const car = await em
        .createQueryBuilder()
        .insert()
        .into(Carrier)
        .values(CARRIERS.map((c) => ({ ...c, awbPrefix: c.awbPrefix ?? null })))
        .orIgnore()
        .returning(['id'])
        .execute();
      const ids = (r: { raw: { id: string }[] }) => r.raw.map((x) => x.id);

      const locations = republish
        ? await em.find(Location)
        : await em.findBy(Location, { id: In(ids(loc)) });
      const carriers = republish
        ? await em.find(Carrier)
        : await em.findBy(Carrier, { id: In(ids(car)) });
      const customers = republish ? await em.find(Customer) : [];

      for (const l of locations) {
        await outbox.add(
          em,
          Topics.locations,
          l.id,
          EventTypes.LocationUpserted,
          toLocationSnapshot(l),
        );
      }
      for (const c of carriers) {
        await outbox.add(
          em,
          Topics.carriers,
          c.id,
          EventTypes.CarrierUpserted,
          toCarrierSnapshot(c),
        );
      }
      for (const c of customers) {
        await outbox.add(
          em,
          Topics.customers,
          c.id,
          EventTypes.CustomerUpserted,
          toCustomerSnapshot(c),
        );
      }
      console.log(
        `Seed complete: ${LOCATIONS.length} locations, ${CARRIERS.length} carriers ensured; ` +
          `${locations.length + carriers.length + customers.length} events queued`,
      );
    });
  } finally {
    await dataSource.destroy();
  }
}

runScript('Seed', seed);
