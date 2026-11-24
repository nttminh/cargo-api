/**
 * End-to-end flow through the gateway against the running system (all four services, their
 * databases and Kafka). Black-box: only HTTP, like a real client.
 *   docker compose up -d --build             (or: docker compose up -d postgres kafka && npm run start:dev)
 *   npm run seed                             (or the compose seed commands, see README)
 *   npm run test:e2e
 * E2E_BASE_URL defaults to http://localhost:3000. Admin credentials come from SEED_ADMIN_*.
 *
 * Master data reaches the shipments and identity services asynchronously (outbox -> Kafka ->
 * local copies), so steps that depend on it retry briefly with eventually().
 */
import request from 'supertest';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@cargo.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'DevAdmin123!';

/** Retries an assertion until it passes or the time is up (eventual consistency). */
async function eventually<T>(fn: () => Promise<T>, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

describe('Cargo API (e2e, through the gateway)', () => {
  let token: string;
  const http = () => request(BASE);
  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
  const unique = Date.now().toString(36).toUpperCase();
  // Unique, valid Vietnam Airlines (738) AWB per run: 7-digit serial + mod-7 check digit.
  const serial = String(Date.now() % 10_000_000).padStart(7, '0');
  const mawb = `738-${serial}${Number(serial) % 7}`;

  const createCustomer = async (prefix: string) =>
    (
      await http()
        .post('/api/v1/customers')
        .set(auth())
        .send({
          code: `${prefix}${unique}`.slice(0, 20),
          companyName: `${prefix} Imports`,
          email: `${prefix.toLowerCase()}@example.com`,
          countryCode: 'US',
        })
        .expect(201)
    ).body;
  const airport = async (code: string) =>
    (await http().get(`/api/v1/locations?type=AIRPORT&search=${code}`).set(auth())).body.data[0];

  beforeAll(async () => {
    const res = await http()
      .post('/api/v1/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    token = res.body.accessToken;
  });

  describe('gateway', () => {
    it('health probes respond', async () => {
      await http().get('/health/live').expect(200);
      await http().get('/health/ready').expect(200);
    });

    it('rejects unauthenticated requests', () => http().get('/api/v1/shipments').expect(401));

    it('rejects an invalid token before it reaches a service', () =>
      http()
        .get('/api/v1/freight/calculate')
        .set(auth('not-a-jwt'))
        .expect(401)
        .expect(({ body }) => expect(body.message).toBe('Invalid or expired token')));

    it('returns 404 for unknown routes and echoes the request id', () =>
      http()
        .get('/api/v1/nope')
        .set('x-request-id', `e2e-${unique}`)
        .expect(404)
        .expect('x-request-id', `e2e-${unique}`));

    it('serves one API reference merged from all services', async () => {
      const { body } = await http().get('/api/v1/docs-json').expect(200);
      for (const path of ['/api/v1/auth/login', '/api/v1/customers', '/api/v1/shipments']) {
        expect(body.paths).toHaveProperty([path]);
      }
      expect(body['x-tagGroups'].map((g: { name: string }) => g.name)).toEqual([
        'Identity',
        'Master data',
        'Shipments',
      ]);
    });
  });

  it('runs an air shipment through its lifecycle and exposes public tracking', async () => {
    const customer = await createCustomer('E2E');
    const [sgn, lax] = [await airport('SGN'), await airport('LAX')];
    const carrier = (await http().get('/api/v1/carriers?mode=AIR&search=VN').set(auth())).body
      .data[0];

    // The new customer reaches the shipments service through Kafka.
    const shipment = await eventually(
      async () =>
        (
          await http()
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
            .expect(201)
        ).body,
    );

    expect(shipment.reference).toMatch(/^AIR-\d{4}-\d{6}$/);
    expect(shipment.status).toBe('DRAFT');
    expect(shipment.chargeableWeightKg).toBe(333.5);
    expect(shipment.customer).toMatchObject({ id: customer.id, code: customer.code });
    expect(shipment.origin).toMatchObject({ code: 'SGN', timezone: 'Asia/Ho_Chi_Minh' });
    expect(shipment.origin).not.toHaveProperty('sourceVersion');

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

  it('propagates master data changes to the shipments service', async () => {
    const customer = await createCustomer('MD');
    const code = `QZ${unique.replace(/[^A-Z2-9]/g, 'X').slice(-3)}`;
    const { body: port } = await http()
      .post('/api/v1/locations')
      .set(auth())
      .send({
        type: 'SEAPORT',
        code,
        name: 'E2E Terminal',
        city: 'Da Nang',
        countryCode: 'VN',
        timezone: 'Asia/Ho_Chi_Minh',
      })
      .expect(201);
    const sin = (await http().get('/api/v1/locations?type=SEAPORT&search=SGSIN').set(auth())).body
      .data[0];

    const shipment = await eventually(
      async () =>
        (
          await http()
            .post('/api/v1/shipments')
            .set(auth())
            .send({
              mode: 'SEA',
              loadType: 'LCL',
              customerId: customer.id,
              shipper: { name: 'Da Nang Wood' },
              consignee: { name: 'MD Imports' },
              originId: port.id,
              destinationId: sin.id,
              commodityDescription: 'Furniture',
              packages: [
                { description: 'Crate', packageType: 'CRATE', quantity: 1, weightKg: 800 },
              ],
            })
            .expect(201)
        ).body,
    );
    expect(shipment.origin.name).toBe('E2E Terminal');

    // Rename at the source; the shipments service picks it up from Kafka.
    await http()
      .patch(`/api/v1/locations/${port.id}`)
      .set(auth())
      .send({ name: 'E2E Terminal Renamed' })
      .expect(200);
    await eventually(async () => {
      const { body } = await http().get(`/api/v1/shipments/${shipment.id}`).set(auth());
      expect(body.origin.name).toBe('E2E Terminal Renamed');
    });

    // A deactivated customer can no longer book.
    await http().delete(`/api/v1/customers/${customer.id}`).set(auth()).expect(204);
    await eventually(() =>
      http()
        .post('/api/v1/shipments')
        .set(auth())
        .send({
          mode: 'SEA',
          customerId: customer.id,
          shipper: { name: 'x' },
          consignee: { name: 'y' },
          originId: port.id,
          destinationId: sin.id,
          commodityDescription: 'Furniture',
          packages: [{ description: 'Crate', packageType: 'CRATE', quantity: 1, weightKg: 1 }],
        })
        .expect(422),
    );
  });

  it('lets a customer user see only their own shipments', async () => {
    const customer = await createCustomer('CU');
    const email = `cu-${unique.toLowerCase()}@example.com`;
    const password = 'Cust0merPass';

    // identity checks customerId against its own copy of the customers.
    await eventually(() =>
      http()
        .post('/api/v1/users')
        .set(auth())
        .send({
          email,
          password,
          fullName: 'Customer User',
          role: 'CUSTOMER',
          customerId: customer.id,
        })
        .expect(201),
    );
    const {
      body: { accessToken },
    } = await http().post('/api/v1/auth/login').send({ email, password }).expect(200);

    const { body: me } = await http().get('/api/v1/auth/me').set(auth(accessToken)).expect(200);
    expect(me).toMatchObject({ email, role: 'CUSTOMER', customerId: customer.id });
    const { body: page } = await http().get('/api/v1/shipments').set(auth(accessToken)).expect(200);
    expect(page.data.every((s: { customerId: string }) => s.customerId === customer.id)).toBe(true);
    await http().get('/api/v1/users').set(auth(accessToken)).expect(403);
  });

  it('stores ETD/ETA as port-local time with the zone and UTC instant', async () => {
    const customer = await createCustomer('TZ');
    const [sgn, lax] = [await airport('SGN'), await airport('LAX')];
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
    const s = await eventually(
      async () =>
        (
          await http()
            .post('/api/v1/shipments')
            .set(auth())
            .send({
              ...base,
              etd: { local: '2026-12-01T14:30' },
              eta: { at: '2026-12-01T20:00:00Z' },
            })
            .expect(201)
        ).body,
    );
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
