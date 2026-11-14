/**
 * Idempotent seed: initial admin user + reference airports, seaports and carriers.
 *   dev:  npm run seed
 *   prod: node dist/database/seeds/run-seed.js   (runs as a Kubernetes Job)
 */
import dataSource from '../data-source';
import { User } from '../../modules/users/user.entity';
import { Location } from '../../modules/locations/location.entity';
import { Carrier } from '../../modules/carriers/carrier.entity';
import { UsersService } from '../../modules/users/users.service';
import { LocationType, TransportMode, UserRole } from '../../common/enums';

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

const KNOWN_DEV_PASSWORDS = ['DevAdmin123!', 'ChangeMe123!'];

async function seed() {
  await dataSource.initialize();
  try {
    await dataSource.transaction(async (em) => {
      // -- Admin ---------------------------------------------------------------
      const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@cargo.local').toLowerCase();
      const password = process.env.SEED_ADMIN_PASSWORD;
      if (!password) throw new Error('SEED_ADMIN_PASSWORD is required');
      // Passwords committed to this repo (.env.example, docker-compose, dev overlay) must never
      // reach a real environment. Local stacks run NODE_ENV=production too, so they opt in
      // explicitly with SEED_ALLOW_DEV_PASSWORD=true; production config never sets it.
      const isKnownDevPassword = KNOWN_DEV_PASSWORDS.includes(password);
      const allowDevPassword = process.env.SEED_ALLOW_DEV_PASSWORD === 'true';
      if (process.env.NODE_ENV === 'production' && isKnownDevPassword && !allowDevPassword) {
        throw new Error(
          'Refusing to seed a committed dev admin password in production. ' +
            'Set a unique SEED_ADMIN_PASSWORD (or SEED_ALLOW_DEV_PASSWORD=true for local stacks only).',
        );
      }
      if (!(await em.exists(User, { where: { email } }))) {
        await em.save(
          em.create(User, {
            email,
            fullName: 'System Administrator',
            role: UserRole.ADMIN,
            customerId: null,
            passwordHash: await UsersService.hashPassword(password),
          }),
        );
        console.log(`Created admin user ${email}`);
      }

      // -- Reference data (insert missing only) --------------------------------
      await em.createQueryBuilder().insert().into(Location).values(LOCATIONS).orIgnore().execute();
      await em
        .createQueryBuilder()
        .insert()
        .into(Carrier)
        .values(CARRIERS.map((c) => ({ ...c, awbPrefix: c.awbPrefix ?? null })))
        .orIgnore()
        .execute();
    });
    console.log(
      `Seed complete: ${LOCATIONS.length} locations, ${CARRIERS.length} carriers ensured`,
    );
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
