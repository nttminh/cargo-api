/**
 * End-to-end flow against a real PostgreSQL database.
 *   docker compose up -d postgres
 *   npm run migration:run && npm run seed
 *   npm run test:e2e
 * Uses the DB_* and SEED_ADMIN_* values from .env.
 */
import { ClassSerializerInterceptor, INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Cargo API (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const unique = Date.now().toString(36).toUpperCase();
  // Unique, valid Vietnam Airlines (738) AWB per run: 7-digit serial + mod-7 check digit.
  const serial = String(Date.now() % 10_000_000).padStart(7, '0');
  const mawb = `738-${serial}${Number(serial) % 7}`;

  beforeAll(async () => {
    process.env.LOG_LEVEL = 'silent';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });
    // Same global pipe and serializer as src/main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
    await app.init();

    const res = await http()
      .post('/api/v1/auth/login')
      .send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD })
      .expect(200);
    token = res.body.accessToken;
  });

  afterAll(() => app?.close());

  it('health probes respond', async () => {
    await http().get('/health/live').expect(200);
    await http().get('/health/ready').expect(200);
  });

  it('rejects unauthenticated requests', () => http().get('/api/v1/shipments').expect(401));

  it('runs an air shipment through its lifecycle and exposes public tracking', async () => {
    const { body: customer } = await http()
      .post('/api/v1/customers')
      .set(auth())
      .send({
        code: `E2E${unique}`.slice(0, 20),
        companyName: 'E2E Imports',
        email: 'e2e@example.com',
        countryCode: 'US',
      })
      .expect(201);

    const loc = async (code: string) =>
      (await http().get(`/api/v1/locations?type=AIRPORT&search=${code}`).set(auth())).body.data[0];
    const [sgn, lax] = [await loc('SGN'), await loc('LAX')];
    const carrier = (await http().get('/api/v1/carriers?mode=AIR&search=VN').set(auth())).body
      .data[0];

    const { body: shipment } = await http()
      .post('/api/v1/shipments')
      .set(auth())
      .send({
        mode: 'AIR',
        customerId: customer.id,
        shipper: { name: 'Saigon Garments', countryCode: 'VN' },
        consignee: { name: 'E2E Imports', countryCode: 'US' },
        originId: sgn.id,
        destinationId: lax.id,
        carrierId: carrier.id,
        masterDocumentNo: mawb,
        flightNumber: 'VN300',
        commodityDescription: 'Garments',
        packages: [
          {
            description: 'Cartons',
            packageType: 'CARTON',
            quantity: 2,
            weightKg: 50,
            lengthCm: 100,
            widthCm: 100,
            heightCm: 100,
          },
        ],
      })
      .expect(201);

    expect(shipment.reference).toMatch(/^AIR-\d{4}-\d{6}$/);
    expect(shipment.status).toBe('DRAFT');
    expect(shipment.chargeableWeightKg).toBe(333.5);

    // Invalid transition is rejected by the state machine.
    await http()
      .post(`/api/v1/shipments/${shipment.id}/status`)
      .set(auth())
      .send({ status: 'DELIVERED' })
      .expect(409);

    for (const status of ['BOOKED', 'RECEIVED', 'DEPARTED']) {
      await http()
        .post(`/api/v1/shipments/${shipment.id}/status`)
        .set(auth())
        .send({ status })
        .expect(201);
    }

    // Booking details are locked after departure.
    await http()
      .patch(`/api/v1/shipments/${shipment.id}`)
      .set(auth())
      .send({ commodityDescription: 'Updated garments' })
      .expect(409);

    // Tracking accepts the AWB with or without the dash.
    const { body: tracking } = await http()
      .get(`/api/v1/tracking/${mawb.replace('-', '')}`)
      .expect(200);
    expect(tracking.reference).toBe(shipment.reference);
    expect(tracking.status).toBe('DEPARTED');
    expect(tracking.events.length).toBe(4);
    expect(tracking).not.toHaveProperty('shipper');
  });

  it('stores ETD/ETA as port-local time with the zone and UTC instant', async () => {
    const { body: customer } = await http()
      .post('/api/v1/customers')
      .set(auth())
      .send({
        code: `TZ${unique}`.slice(0, 20),
        companyName: 'TZ Imports',
        email: 'tz@example.com',
        countryCode: 'US',
      })
      .expect(201);
    const loc = async (code: string) =>
      (await http().get(`/api/v1/locations?type=AIRPORT&search=${code}`).set(auth())).body.data[0];
    const [sgn, lax] = [await loc('SGN'), await loc('LAX')];
    const base = {
      mode: 'AIR',
      customerId: customer.id,
      shipper: { name: 'Saigon Garments' },
      consignee: { name: 'TZ Imports' },
      originId: sgn.id,
      destinationId: lax.id,
      commodityDescription: 'Garments',
      packages: [{ description: 'Cartons', packageType: 'CARTON', quantity: 1, weightKg: 10 }],
    };

    // ETD as local time at SGN (zone taken from the airport); ETA as an instant.
    const { body: s } = await http()
      .post('/api/v1/shipments')
      .set(auth())
      .send({
        ...base,
        etd: { local: '2026-12-01T14:30' },
        eta: { at: '2026-12-01T20:00:00Z' },
      })
      .expect(201);
    expect(s.etd).toEqual({
      local: '2026-12-01T14:30:00',
      timeZone: 'Asia/Ho_Chi_Minh',
      utc: '2026-12-01T07:30:00.000Z',
    });
    expect(s).not.toHaveProperty('etdLocal');
    expect(s.eta).toEqual({
      local: '2026-12-01T12:00:00',
      timeZone: 'America/Los_Angeles',
      utc: '2026-12-01T20:00:00.000Z',
    });

    // Round trip through the database keeps the wall-clock time exactly.
    const { body: again } = await http().get(`/api/v1/shipments/${s.id}`).set(auth()).expect(200);
    expect(again.etd).toEqual(s.etd);

    // Update ETA only; ETD is kept. null clears.
    const { body: updated } = await http()
      .patch(`/api/v1/shipments/${s.id}`)
      .set(auth())
      .send({ eta: { local: '2026-12-02T08:15' } })
      .expect(200);
    expect(updated.etd).toEqual(s.etd);
    expect(updated.eta.utc).toBe('2026-12-02T16:15:00.000Z');
    const { body: cleared } = await http()
      .patch(`/api/v1/shipments/${s.id}`)
      .set(auth())
      .send({ eta: null })
      .expect(200);
    expect(cleared.eta).toBeNull();

    // Times that don't exist or are ambiguous at LAX (DST) are rejected, not guessed.
    await http()
      .post('/api/v1/shipments')
      .set(auth())
      .send({ ...base, eta: { local: '2027-03-14T02:30' } })
      .expect(400);
    await http()
      .post('/api/v1/shipments')
      .set(auth())
      .send({ ...base, eta: { local: '2026-11-01T01:30' } })
      .expect(400);

    // Instants without an offset are rejected everywhere.
    await http()
      .post('/api/v1/shipments')
      .set(auth())
      .send({ ...base, eta: { at: '2026-12-01T20:00:00' } })
      .expect(400);
    await http().get('/api/v1/shipments?etdFrom=2026-12-01T00:00:00').set(auth()).expect(400);

    // Filtering by ETD uses the UTC instant.
    const { body: page } = await http()
      .get('/api/v1/shipments?etdFrom=2026-12-01T07:30:00Z&etdTo=2026-12-01T07:30:00Z')
      .set(auth())
      .expect(200);
    expect(page.data.map((x: { id: string }) => x.id)).toContain(s.id);
  });

  it('calculates sea W/M revenue tons on the public freight endpoint', () =>
    http()
      .post('/api/v1/freight/calculate')
      .send({
        mode: 'SEA',
        packages: [{ description: 'x', packageType: 'PALLET', quantity: 1, weightKg: 1500 }],
      })
      .expect(200)
      .expect(({ body }) => expect(body.revenueTons).toBe(1.5)));
});
