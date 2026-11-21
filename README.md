# Cargo API

Backend for an **air & sea freight forwarder**, built with NestJS, PostgreSQL (TypeORM), Docker and Kubernetes.

## Features

| Area | What it does |
|---|---|
| **Auth** | JWT bearer auth, bcrypt passwords, roles `ADMIN` / `OPERATOR` / `CUSTOMER`. Customer users only ever see their own shipments. |
| **Customers** | Shipper/consignee accounts (soft-deactivated, never hard-deleted). |
| **Locations** | Airports (IATA `SGN`) and seaports (UN/LOCODE `VNSGN`). |
| **Carriers** | Airlines (IATA code + AWB prefix) and ocean carriers (SCAC). |
| **Shipments** | Air (`LOOSE`) and sea (`FCL`/`LCL`) shipments with packages, containers, parties, Incoterms, MAWB/HAWB or MBL/HBL, flight or vessel/voyage, ETD/ETA/ATD/ATA. |
| **Freight maths** | Air chargeable weight (IATA 1:6000, rounded up to 0.5 kg); sea W/M revenue tons (min 1). |
| **Validation** | ISO 6346 container check digits, IATA AWB mod-7 check, mode-consistent routing and carriers. |
| **Status workflow** | Enforced state machine `DRAFT -> BOOKED -> RECEIVED -> DEPARTED -> IN_TRANSIT -> ARRIVED -> CUSTOMS_* -> OUT_FOR_DELIVERY -> DELIVERED` (+ `CANCELLED` before departure). Each change writes a tracking event. Booking data is locked after departure. |
| **Public tracking** | `GET /api/v1/tracking/:number` by reference, HAWB/HBL or MAWB/MBL (in that order). No parties or values are exposed. A master document shared by several consolidated shipments returns `409` and asks for the reference or house number. |
| **Ops** | Structured JSON logs with request ids, Helmet, CORS, rate limiting, consistent error envelope, OpenAPI docs (Scalar), liveness/readiness probes, graceful shutdown. |

## API overview

Base path `/api/v1`. Interactive API reference (Scalar) at **`/api/v1/docs`**; the OpenAPI spec is at `/api/v1/docs-json` and `/api/v1/docs-yaml` (disable all three with `API_DOCS_ENABLED=false`).

```
POST   /auth/login                      public, rate limited
GET    /auth/me
POST   /auth/change-password
CRUD   /users                           ADMIN
CRUD   /customers                       ADMIN/OPERATOR (customers can read their own)
CRUD   /locations     ?type=&countryCode=&search=
CRUD   /carriers      ?mode=&search=
POST   /shipments                       customers create DRAFT bookings for themselves
GET    /shipments     ?mode=&status=A,B&origin=SGN&destination=LAX&etdFrom=&etdTo=&search=&sortBy=&sortOrder=
GET    /shipments/:id
PATCH  /shipments/:id                   ADMIN/OPERATOR, before departure
POST   /shipments/:id/status            ADMIN/OPERATOR
GET    /shipments/:id/events
POST   /shipments/:id/events            ADMIN/OPERATOR, informational milestone
GET    /tracking/:trackingNumber        public
POST   /freight/calculate               public
GET    /health/live  /health/ready      (no prefix) Kubernetes probes
```

## Run locally

### Option A: everything in Docker

```bash
docker compose up -d --build
# seed admin user + reference airports/seaports/carriers (idempotent)
docker compose run --rm api node dist/database/seeds/run-seed.js
```

Log in as `admin@cargo.local` / `DevAdmin123!` at http://localhost:3000/api/v1/docs.

### Option B: Node on the host, Postgres in Docker

```bash
cp .env.example .env            # already done if you cloned this as-is
docker compose up -d postgres
npm install
npm run migration:run
npm run seed                    # admin@cargo.local / DevAdmin123!
npm run start:dev
```

### Tests

```bash
npm test                        # unit tests (no DB needed)
npm run test:e2e                # full flow, needs Postgres + migrations + seed
npm run lint
```

## Database & migrations

* Schema changes **only** via migrations (`synchronize` is off).
* After changing an entity: `npm run migration:generate --name=DescribeChange`, review the file, then `npm run migration:run`.
* `node dist/database/migrate.js` (used in Kubernetes) takes a Postgres **advisory lock**, so many pods can start at once and only one applies migrations.
* Shipment references (`AIR-2611-000042`) come from the `shipment_reference_seq` sequence.
* The seed refuses the committed dev passwords (`DevAdmin123!`, `ChangeMe123!`) when `NODE_ENV=production`, unless `SEED_ALLOW_DEV_PASSWORD=true` (set only by docker-compose and the dev k8s overlay).

## Kubernetes

Kustomize layout:

```
k8s/
  base/                 Namespace (PSS restricted), ServiceAccount, ConfigMap, Deployment,
                        Service, HPA, PodDisruptionBudget, NetworkPolicy
  overlays/dev/         1 replica, in-cluster Postgres StatefulSet, dev secrets
  overlays/prod/        3-20 replicas, Ingress + TLS, managed DB, secrets from secrets.env
  jobs/seed-job.yaml    one-off seed Job
```

Deployment highlights: migrations in an initContainer; startup/liveness/readiness probes (`/health/live`, `/health/ready`; readiness checks the DB, liveness doesn't, so a DB blip doesn't restart pods); `preStop` delay + `tini` + Nest shutdown hooks for zero-downtime rollouts; non-root, read-only root FS, all capabilities dropped; spread across nodes and zones.

**Dev cluster** (Docker Desktop / kind / minikube):

```bash
docker build -t cargo-api:dev .          # kind: kind load docker-image cargo-api:dev
kubectl apply -k k8s/overlays/dev
kubectl -n cargo-dev create -f k8s/jobs/seed-job.yaml   # edit image to cargo-api:dev first
kubectl -n cargo-dev port-forward svc/cargo-api 3000:80
```

**Production:**

```bash
docker build -t ghcr.io/your-org/cargo-api:1.0.0 . && docker push ghcr.io/your-org/cargo-api:1.0.0
cp k8s/overlays/prod/secrets.env.example k8s/overlays/prod/secrets.env   # fill in; gitignored
# edit DB_HOST / CORS_ORIGINS in overlays/prod/kustomization.yaml and the host in ingress.yaml
kubectl apply -k k8s/overlays/prod
kubectl -n cargo create -f k8s/jobs/seed-job.yaml      # first deploy only
```

For real environments, replace `secrets.env` with External Secrets / Sealed Secrets / SOPS producing a Secret named `cargo-api-secrets`.

## Configuration

All config comes from environment variables, validated at startup (see `.env.example` and `src/config/env.validation.ts`). The app refuses to start with a missing DB config or a `JWT_SECRET` shorter than 32 characters.

## Project layout

```
src/
  main.ts, app.module.ts
  config/                     env schema + typed config
  common/                     base entity, enums, guards, decorators, error filter, pagination
  database/                   data source, migrations, advisory-locked migrate runner, seed
  modules/
    auth/ users/ customers/ locations/ carriers/ health/
    shipments/
      domain/                 pure logic: freight calculator, status machine, validators (+ specs)
      entities/               shipment, package, container, tracking event
      shipments|tracking|freight .controller.ts, shipments.service.ts
```
