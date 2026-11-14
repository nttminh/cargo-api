/**
 * End-to-end flow against a real PostgreSQL database.
 *   docker compose up -d postgres
 *   npm run migration:run && npm run seed
 *   npm run test:e2e
 * Uses the DB_* and SEED_ADMIN_* values from .env.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
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
