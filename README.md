# Cargo API

Backend for an **air & sea freight forwarder**: NestJS microservices with PostgreSQL (one database per service), Kafka, Docker and Kubernetes.

## Architecture

```
                      clients
                         |
                 [ gateway :3000 ]      public entry point: routing, CORS, rate limits,
                  /      |      \       token check, merged API reference
                 /       |       \
      [ identity ] [ master-data ] [ shipments ]     each verifies tokens and owns its data
           |              |              |
      cargo_identity  cargo_master_data  cargo_shipments      PostgreSQL, one database each
           ^              |              ^
           |              v              |
           +------- [ Kafka ] -----------+      master data changes, shipment events
```

| Service | Owns | Database | Kafka |
|---|---|---|---|
| **gateway** | Routing table, CORS, rate limits, API reference | none | none |
| **identity** | Users, login, access tokens | `cargo_identity` | consumes customers |
| **master-data** | Customers, airports/seaports, carriers | `cargo_master_data` | publishes customers, locations, carriers |
| **shipments** | Shipments, packages, containers, tracking events, public tracking, freight calculator | `cargo_shipments` | consumes master data, publishes shipment events |

**Gateway.** The gateway is the only public entry point, and the services sit behind it.
- **Proxying:** it streams each request to the service that owns the path and does not buffer bodies.
- **At the edge:** it applies CORS and rate limits. It rejects invalid or expired tokens early and assigns the `x-request-id` that every service logs.
- **Unreachable service:** clients get a `503` in the usual error format.

**Auth.** The identity service signs JWTs. Every service verifies the token itself and enforces roles, so a request that skips the gateway is still checked.

**No synchronous service-to-service calls.**
- **Replicas instead of calls:** the shipments service needs customers, locations and carriers. Instead of calling master-data, it keeps a local read-only copy (`customer_refs`, `location_refs` and `carrier_refs`), kept up to date from Kafka. The identity service does the same for customers. A request therefore never depends on another service being up.
- **Eventual consistency:** a customer created a moment ago can take a moment, usually well under a second, to become usable in the other services.

**Messaging** (`libs/messaging`):

* **Transactional outbox.** A change and its event are written in the same database transaction (`outbox` table). A relay in each producing service publishes the rows to Kafka in order. While Kafka is down, writes still succeed and the events go out when it is back.
* **Event-carried state transfer.** The master-data topics (`masterdata.customers.v1`, `masterdata.locations.v1`, `masterdata.carriers.v1`) carry the full current record and are compacted. A new consumer, or a rebuilt replica, replays the current state from the beginning.
* **Idempotent consumers.** Each snapshot carries the record's `version`. A replica row is only overwritten by a newer version, so duplicates and reordering are harmless (delivery is at-least-once).
* **Shipment events.** `shipments.events.v1` (`ShipmentCreated`, `ShipmentStatusChanged`) is there for future consumers (notifications, billing, analytics).
* **Contracts.** Topics and payloads live in `libs/messaging/src/contracts.ts`. A breaking change gets a new topic version.

## Features

| Area | What it does |
|---|---|
| **Auth** | JWT bearer auth, bcrypt passwords, roles `ADMIN` / `OPERATOR` / `CUSTOMER`. Customer users only ever see their own shipments. |
| **Customers** | Shipper/consignee accounts (soft-deactivated, never hard-deleted). |
| **Locations** | Airports (IATA `SGN`) and seaports (UN/LOCODE `VNSGN`). |
| **Carriers** | Airlines (IATA code + AWB prefix) and ocean carriers (SCAC). |
| **Shipments** | Air (`LOOSE`) and sea (`FCL`/`LCL`) shipments. Each has packages, containers, parties, Incoterms, MAWB/HAWB or MBL/HBL, flight or vessel/voyage, and ATD/ATA. ETD/ETA are in port-local time (see [Dates and time zones](#dates-and-time-zones)). |
| **Freight maths** | Air chargeable weight (IATA 1:6000, rounded up to 0.5 kg); sea W/M revenue tons (min 1). |
| **Validation** | ISO 6346 container check digits, IATA AWB mod-7 check, mode-consistent routing and carriers. |
| **Status workflow** | Enforced state machine `DRAFT -> BOOKED -> RECEIVED -> DEPARTED -> IN_TRANSIT -> ARRIVED -> CUSTOMS_* -> OUT_FOR_DELIVERY -> DELIVERED` (+ `CANCELLED` before departure). Each change writes a tracking event and publishes `ShipmentStatusChanged`. Booking data is locked after departure. |
| **Public tracking** | `GET /api/v1/tracking/:number` by reference, HAWB/HBL or MAWB/MBL (in that order). No parties or values are exposed. A master document shared by several consolidated shipments returns `409` and asks for the reference or house number. |
| **Ops** | Structured JSON logs with request ids across services, Helmet, CORS, rate limiting, consistent error envelope, OpenAPI docs (Scalar), liveness/readiness probes, graceful shutdown. |

## API overview

Base path `/api/v1` on the gateway.
- **API reference (Scalar):** **`/api/v1/docs`**, merged from all services.
- **OpenAPI spec:** `/api/v1/docs-json` and `/api/v1/docs-yaml`.
- **Turning docs off:** `API_DOCS_ENABLED=false` disables all three.

```
identity     POST   /auth/login                      public, rate limited (10/min)
             GET    /auth/me
             POST   /auth/change-password
             CRUD   /users                           ADMIN
master-data  CRUD   /customers                       ADMIN/OPERATOR (customers can read their own)
             CRUD   /locations     ?type=&countryCode=&search=
             CRUD   /carriers      ?mode=&search=
shipments    POST   /shipments                       customers create DRAFT bookings for themselves
             GET    /shipments     ?mode=&status=A,B&origin=SGN&destination=LAX&etdFrom=&etdTo=&search=&sortBy=&sortOrder=
             GET    /shipments/:id
             PATCH  /shipments/:id                   ADMIN/OPERATOR, before departure
             POST   /shipments/:id/status            ADMIN/OPERATOR
             GET    /shipments/:id/events
             POST   /shipments/:id/events            ADMIN/OPERATOR, informational milestone
             GET    /tracking/:trackingNumber        public, rate limited (30/min)
             POST   /freight/calculate               public
every service GET   /health/live  /health/ready      (no prefix) Kubernetes probes
```

## Run locally

### Option A: everything in Docker

```bash
docker compose up -d --build
# seed: admin user (identity) + reference airports/seaports/carriers (master-data); idempotent
docker compose run --rm identity node dist/apps/identity/src/database/seed.js
docker compose run --rm master-data node dist/apps/master-data/src/database/seed.js
```

Log in as `admin@cargo.local` / `DevAdmin123!` at http://localhost:3000/api/v1/docs.

The stack runs:
- **PostgreSQL** with three databases and roles, created by `docker/postgres/init-databases.sql`.
- **Kafka 4.1** as a single node in KRaft mode: `kafka:29092` inside Docker, `localhost:9092` from the host.
- **The four services.** Only the gateway is published, on port 3000.

### Option B: services on the host, infrastructure in Docker

Requires **Node.js 22** (see `.nvmrc`; e.g. `nvm install 22.23.5 && nvm use 22.23.5`).

```bash
cp .env.example .env                                   # shared settings
for app in gateway identity master-data shipments; do  # per-service port and database
  cp apps/$app/.env.example apps/$app/.env
done
docker compose up -d postgres kafka
npm install
npm run migration:run                                  # all three databases
npm run seed                                           # admin@cargo.local / DevAdmin123!
npm run start:dev                                      # all four services, watch mode
```

The gateway listens on :3000. Identity, master-data and shipments use :3001, :3002 and :3003, and you can call them directly while debugging. To run a single service, use `npx nest start identity --watch`.

### Tests

```bash
npm test                        # unit tests (no DB, no Kafka)
npm run test:e2e                # black-box, through the gateway: needs the running stack + seed
npm run lint
```

The e2e suite talks HTTP to `E2E_BASE_URL` (default `http://localhost:3000`).
- **What it covers:** the gateway itself, the shipment lifecycle, public tracking, time zones, customer users, and master data changes reaching the shipments service through Kafka.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and every push to `main`:

| Job | What it checks |
|---|---|
| Lint, type-check, unit tests, build | ESLint/Prettier, `tsc`, Jest unit tests, `nest build` of all four services |
| Migrations and seeds | For each service against PostgreSQL 16: migrate, revert, re-apply, and fail if an entity changed without a matching migration. Then both seeds twice (must be idempotent) |
| Kubernetes manifests | Both kustomize overlays render |
| Images + end-to-end | Builds the four images (non-root), starts the full stack with Docker Compose (PostgreSQL, Kafka, services), seeds it and runs the e2e suite through the gateway |

On `main`, after all jobs pass, the four images are pushed to `ghcr.io/nttminh/cargo-<service>`, tagged `sha-<commit>` and `latest`. Pull requests build and test the images but never push them. Dependabot (`.github/dependabot.yml`) opens weekly update PRs for npm packages, GitHub Actions and the Docker base image.

## Dates and time zones

The API is used from many time zones, so times are handled in two different ways:

**Instants** (things that happened or system times): `createdAt`, `updatedAt`, `lastLoginAt`, tracking `occurredAt`, `atd`, `ata`, `deliveredAt`.

* Stored as `timestamptz` (UTC). Returned as ISO 8601 in UTC, e.g. `2026-12-01T07:30:00.000Z`.
* Input must include an offset (`Z` or `+07:00`). A value without one is rejected with `400`, never read in the server's time zone.

**Planned local times** (schedules agreed in the port's local time): `etd` (origin port) and `eta` (destination port).

* **Storage:** three columns per field.
  * `etd_local` (`timestamp`): the agreed wall-clock time, and the source of truth.
  * `etd_tz`: the IANA zone, e.g. `Asia/Ho_Chi_Minh`.
  * `etd_utc` (`timestamptz`): derived, used for sorting and the `etdFrom`/`etdTo` filters.
  * `eta` works the same way.
* Returned as `{ "local": "2026-12-01T14:30:00", "timeZone": "Asia/Ho_Chi_Minh", "utc": "2026-12-01T07:30:00.000Z" }`.
* **Input:** send one of two forms. On update, `null` clears the value.
  * `{ "local": "2026-12-01T14:30" }`: the zone defaults to the port's; pass `timeZone` to override it.
  * `{ "at": "2026-12-01T07:30:00Z" }`: converted to the port's local time.
* **DST:** local times that don't exist (skipped when clocks spring forward) or happen twice (when clocks fall back) are rejected. For the repeated hour, send `at` with an explicit offset.
* Every location must have an IANA `timezone`. The shipments service takes it from its copy of the location.
* **When time zone rules change** (new tzdata in a new Node image), the local time stays as agreed and only its UTC instant moves.
  * Re-derive it with `npm run schedules:recompute` (in the image: `node dist/apps/shipments/src/database/recompute-schedules.js`).
  * In Kubernetes, the `cargo-shipments-recompute-schedules` CronJob runs it weekly.

Every process always runs in UTC (`libs/common/src/time/force-utc.ts`, `TZ=UTC` in the images, database session `timezone=UTC`), so behaviour doesn't depend on the host.

## Databases & migrations

* Each service has its own database and its own migrations in `apps/<service>/src/database/migrations`, and runs only those. No service reads another service's tables.
* Schema changes **only** via migrations (`synchronize` is off).
* **After changing an entity:**
  1. Generate a migration: `npm run migration:generate:<service> -- apps/<service>/src/database/migrations/DescribeChange`.
  2. Review the generated file.
  3. Apply it: `npm run migration:run:<service>`.
* `node dist/apps/<service>/src/database/migrate.js` (used in Kubernetes) takes a Postgres **advisory lock**, so many pods can start at once and only one applies migrations.
* Shipment references (`AIR-2611-000042`) come from the `shipment_reference_seq` sequence in the shipments database.
* **Seeds:** `npm run seed` runs both.
  * `seed:identity` creates the admin user.
  * `seed:master-data` creates airports, seaports and carriers, and publishes them through the outbox.
* **Dev password guard:** the identity seed refuses the committed dev passwords (`DevAdmin123!`, `ChangeMe123!`) when `NODE_ENV=production`, unless `SEED_ALLOW_DEV_PASSWORD=true`. Only docker-compose and the dev k8s overlay set it.
* **Rebuilding the copies:** if a Kafka topic or a service's replica tables are lost, re-publish all master data with `npm run masterdata:republish` (in the image: `node dist/apps/master-data/src/database/seed.js --republish`).
* **Schema changes during rollouts:** old and new pods run side by side, so keep each migration backward compatible. Remove a column in two releases: first stop using it, then drop it.

## Kubernetes

Kustomize layout:

```
k8s/
  base/                     Namespace (PSS restricted), ServiceAccount, shared ConfigMap, jobs NetworkPolicy
    gateway/                ConfigMap, Deployment, Service, HPA, PDB, NetworkPolicy
    identity/               same, plus a migrate initContainer
    master-data/            same, plus a migrate initContainer
    shipments/              same, plus a migrate initContainer and the recompute CronJob
  overlays/dev/             1 replica each, in-cluster PostgreSQL (3 databases) and single-node Kafka
  overlays/prod/            3-20 replicas each, Ingress + TLS -> gateway, managed databases and Kafka
  jobs/seed-*.yaml          one-off seed Jobs (identity, master-data)
```

Each Deployment has:
- **Migrations:** run in an initContainer before the app starts (backends only).
- **Probes:** startup, liveness and readiness (`/health/live`, `/health/ready`). Readiness checks the service's own database. Liveness doesn't, so a DB blip doesn't restart pods. Neither checks Kafka, because the outbox covers Kafka outages.
- **Zero-downtime rollouts:** a `preStop` delay, `tini` and Nest shutdown hooks.
- **Hardening:** non-root user, read-only root filesystem, all capabilities dropped.
- **Spread:** pods are spread across nodes and zones.

**NetworkPolicies** enforce the architecture:
- **Gateway:** reachable on port 3000; it may only call the backends.
- **Backends:** accept traffic only from the gateway, and may only reach DNS, PostgreSQL and Kafka.
- **Jobs:** may only reach DNS and PostgreSQL.

**Dev cluster** (Docker Desktop / kind / minikube):

```bash
for app in gateway identity master-data shipments; do
  docker build --build-arg APP=$app -t cargo-$app:dev .   # kind: kind load docker-image cargo-$app:dev
done
kubectl apply -k k8s/overlays/dev
# edit the image in each seed Job to cargo-<service>:dev first
kubectl -n cargo-dev create -f k8s/jobs/seed-identity.yaml
kubectl -n cargo-dev create -f k8s/jobs/seed-master-data.yaml
kubectl -n cargo-dev port-forward svc/cargo-gateway 3000:80
```

**Production:**

```bash
for f in k8s/overlays/prod/secrets/*.env.example; do cp "$f" "${f%.example}"; done   # fill in; gitignored
# edit the database hosts, Kafka brokers and CORS_ORIGINS in overlays/prod/kustomization.yaml
# and the host in ingress.yaml; pin each image to the sha-<commit> tag CI published
kubectl apply -k k8s/overlays/prod
kubectl -n cargo create -f k8s/jobs/seed-identity.yaml       # first deploy only
kubectl -n cargo create -f k8s/jobs/seed-master-data.yaml
```

**Infrastructure:**
- **Secrets:** for real environments, replace the `secrets/*.env` files with External Secrets, Sealed Secrets or SOPS, producing Secrets with the same names.
- **Kafka:** use a managed service (MSK, Confluent Cloud, Aiven) or Strimzi, with 3 or more brokers.
- **PostgreSQL:** use one managed database per service.

**Applying config changes:** ConfigMaps and Secrets keep stable names (the seed Jobs reference them). After changing one, run `kubectl rollout restart deployment`.

**Rate limits:** they are counted per gateway pod. With several gateway replicas the effective limit is multiplied; use a shared store (Redis) if it has to be exact.

## Configuration

All config comes from environment variables. Each service validates only what it uses at startup (`libs/common/src/config/env.validation.ts`), and refuses to start with a missing value or a `JWT_SECRET` shorter than 32 characters.
- **On the host:** each service reads `apps/<service>/.env`, then the root `.env`.
- **Kafka:** `KAFKA_BROKERS`, plus `KAFKA_SSL` and `KAFKA_SASL_*` for managed clusters.

## Project layout

```
apps/
  gateway/src/          proxy (routing table, edge auth), merged API docs
  identity/src/         auth, users, customer replica + consumer, database (migrations, seed)
  master-data/src/      customers, locations, carriers (publish via outbox), database (migrations, seed)
  shipments/src/
    shipments/          controllers, service, entities
      domain/           pure logic: freight calculator, status machine, validators (+ specs)
    refs/               customer/location/carrier replicas + Kafka consumer
    database/           migrations, schedule recompute
libs/
  common/               config, logging, auth guards, error filter, health, time zones, bootstrap
  messaging/            event contracts, Kafka client, outbox + relay, consumer base, replica upsert
docker/postgres/        init script: one database + role per service
test/                   e2e suite (black-box, through the gateway)
```
