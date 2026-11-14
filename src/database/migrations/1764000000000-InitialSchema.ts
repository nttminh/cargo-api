import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1764000000000 implements MigrationInterface {
  name = 'InitialSchema1764000000000';

  public async up(q: QueryRunner): Promise<void> {
    // ---- Enum types ---------------------------------------------------------
    await q.query(`CREATE TYPE "transport_mode" AS ENUM ('AIR', 'SEA')`);
    await q.query(`CREATE TYPE "location_type" AS ENUM ('AIRPORT', 'SEAPORT')`);
    await q.query(`CREATE TYPE "user_role" AS ENUM ('ADMIN', 'OPERATOR', 'CUSTOMER')`);
    await q.query(
      `CREATE TYPE "shipment_status" AS ENUM ('DRAFT', 'BOOKED', 'RECEIVED', 'DEPARTED', 'IN_TRANSIT', 'ARRIVED', 'CUSTOMS_HOLD', 'CUSTOMS_CLEARED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED')`,
    );
    await q.query(`CREATE TYPE "load_type" AS ENUM ('FCL', 'LCL', 'LOOSE')`);
    await q.query(
      `CREATE TYPE "container_type" AS ENUM ('20GP', '40GP', '40HC', '45HC', '20RF', '40RF', '20OT', '40OT', '20FR', '40FR')`,
    );
    await q.query(
      `CREATE TYPE "incoterm" AS ENUM ('EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP')`,
    );
    await q.query(
      `CREATE TYPE "package_type" AS ENUM ('PALLET', 'CARTON', 'CRATE', 'DRUM', 'BAG', 'ROLL', 'PIECE', 'OTHER')`,
    );

    // Global counter for human-readable shipment references (AIR-2611-000001).
    await q.query(`CREATE SEQUENCE "shipment_reference_seq" START 1`);

    // ---- customers ----------------------------------------------------------
    await q.query(`
      CREATE TABLE "customers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "version" integer NOT NULL DEFAULT 1,
        "code" character varying(20) NOT NULL,
        "company_name" character varying(200) NOT NULL,
        "contact_name" character varying(150),
        "email" character varying(255) NOT NULL,
        "phone" character varying(40),
        "tax_id" character varying(50),
        "address_line1" character varying(255),
        "address_line2" character varying(255),
        "city" character varying(100),
        "postal_code" character varying(20),
        "country_code" character varying(2) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "pk_customers" PRIMARY KEY ("id")
      )`);
    await q.query(`CREATE UNIQUE INDEX "uq_customers_code" ON "customers" ("code")`);

    // ---- users --------------------------------------------------------------
    await q.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "version" integer NOT NULL DEFAULT 1,
        "email" character varying(255) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "full_name" character varying(150) NOT NULL,
        "role" "user_role" NOT NULL DEFAULT 'CUSTOMER',
        "customer_id" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        "last_login_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "fk_users_customer_id" FOREIGN KEY ("customer_id")
          REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )`);
    await q.query(`CREATE UNIQUE INDEX "uq_users_email" ON "users" ("email")`);

    // ---- locations (airports & seaports) ------------------------------------
    await q.query(`
      CREATE TABLE "locations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "version" integer NOT NULL DEFAULT 1,
        "type" "location_type" NOT NULL,
        "code" character varying(5) NOT NULL,
        "name" character varying(150) NOT NULL,
        "city" character varying(100) NOT NULL,
        "country_code" character varying(2) NOT NULL,
        "timezone" character varying(64),
        "latitude" numeric(9,6),
        "longitude" numeric(9,6),
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "pk_locations" PRIMARY KEY ("id")
      )`);
    await q.query(`CREATE UNIQUE INDEX "uq_locations_type_code" ON "locations" ("type", "code")`);

    // ---- carriers (airlines & ocean carriers) -------------------------------
    await q.query(`
      CREATE TABLE "carriers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "version" integer NOT NULL DEFAULT 1,
        "mode" "transport_mode" NOT NULL,
        "code" character varying(4) NOT NULL,
        "awb_prefix" character varying(3),
        "name" character varying(150) NOT NULL,
        "tracking_url_template" character varying(500),
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "pk_carriers" PRIMARY KEY ("id")
      )`);
    await q.query(`CREATE UNIQUE INDEX "uq_carriers_mode_code" ON "carriers" ("mode", "code")`);

    // ---- shipments ----------------------------------------------------------
    await q.query(`
      CREATE TABLE "shipments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "version" integer NOT NULL DEFAULT 1,
        "reference" character varying(20) NOT NULL,
        "mode" "transport_mode" NOT NULL,
        "load_type" "load_type" NOT NULL,
        "status" "shipment_status" NOT NULL DEFAULT 'DRAFT',
        "customer_id" uuid NOT NULL,
        "shipper" jsonb NOT NULL,
        "consignee" jsonb NOT NULL,
        "notify_party" jsonb,
        "origin_id" uuid NOT NULL,
        "destination_id" uuid NOT NULL,
        "carrier_id" uuid,
        "incoterm" "incoterm",
        "master_document_no" character varying(40),
        "house_document_no" character varying(40),
        "flight_number" character varying(10),
        "vessel_name" character varying(100),
        "voyage_number" character varying(20),
        "etd" TIMESTAMP WITH TIME ZONE,
        "eta" TIMESTAMP WITH TIME ZONE,
        "atd" TIMESTAMP WITH TIME ZONE,
        "ata" TIMESTAMP WITH TIME ZONE,
        "delivered_at" TIMESTAMP WITH TIME ZONE,
        "commodity_description" character varying(500) NOT NULL,
        "total_pieces" integer NOT NULL DEFAULT 0,
        "gross_weight_kg" numeric(12,3) NOT NULL DEFAULT 0,
        "volume_cbm" numeric(12,4) NOT NULL DEFAULT 0,
        "chargeable_weight_kg" numeric(12,3),
        "revenue_tons" numeric(12,3),
        "is_hazardous" boolean NOT NULL DEFAULT false,
        "declared_value" numeric(14,2),
        "currency" character varying(3),
        "special_instructions" text,
        "created_by_id" uuid,
        CONSTRAINT "pk_shipments" PRIMARY KEY ("id"),
        CONSTRAINT "chk_shipments_route" CHECK ("origin_id" <> "destination_id"),
        CONSTRAINT "fk_shipments_customer_id" FOREIGN KEY ("customer_id")
          REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_shipments_origin_id" FOREIGN KEY ("origin_id")
          REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_shipments_destination_id" FOREIGN KEY ("destination_id")
          REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_shipments_carrier_id" FOREIGN KEY ("carrier_id")
          REFERENCES "carriers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_shipments_created_by_id" FOREIGN KEY ("created_by_id")
          REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )`);
    await q.query(`CREATE UNIQUE INDEX "uq_shipments_reference" ON "shipments" ("reference")`);
    await q.query(
      `CREATE INDEX "ix_shipments_customer_created" ON "shipments" ("customer_id", "created_at")`,
    );
    await q.query(`CREATE INDEX "ix_shipments_status" ON "shipments" ("status")`);
    await q.query(`CREATE INDEX "ix_shipments_mode_status" ON "shipments" ("mode", "status")`);
    await q.query(`CREATE INDEX "ix_shipments_master_doc" ON "shipments" ("master_document_no")`);
    await q.query(`CREATE INDEX "ix_shipments_house_doc" ON "shipments" ("house_document_no")`);

    // ---- shipment_packages --------------------------------------------------
    await q.query(`
      CREATE TABLE "shipment_packages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shipment_id" uuid NOT NULL,
        "description" character varying(255) NOT NULL,
        "package_type" "package_type" NOT NULL,
        "quantity" integer NOT NULL,
        "weight_kg" numeric(10,3) NOT NULL,
        "length_cm" numeric(8,2),
        "width_cm" numeric(8,2),
        "height_cm" numeric(8,2),
        "hs_code" character varying(12),
        "is_hazardous" boolean NOT NULL DEFAULT false,
        "un_number" character varying(6),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_shipment_packages" PRIMARY KEY ("id"),
        CONSTRAINT "chk_shipment_packages_quantity" CHECK ("quantity" > 0 AND "weight_kg" > 0),
        CONSTRAINT "fk_shipment_packages_shipment_id" FOREIGN KEY ("shipment_id")
          REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`);
    await q.query(
      `CREATE INDEX "ix_shipment_packages_shipment" ON "shipment_packages" ("shipment_id")`,
    );

    // ---- shipment_containers ------------------------------------------------
    await q.query(`
      CREATE TABLE "shipment_containers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shipment_id" uuid NOT NULL,
        "container_number" character varying(11) NOT NULL,
        "container_type" "container_type" NOT NULL,
        "seal_number" character varying(30),
        "tare_weight_kg" numeric(10,2),
        "vgm_kg" numeric(10,2),
        "temperature_c" numeric(5,2),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_shipment_containers" PRIMARY KEY ("id"),
        CONSTRAINT "fk_shipment_containers_shipment_id" FOREIGN KEY ("shipment_id")
          REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`);
    await q.query(
      `CREATE UNIQUE INDEX "uq_shipment_containers_number" ON "shipment_containers" ("shipment_id", "container_number")`,
    );
    await q.query(
      `CREATE INDEX "ix_shipment_containers_number" ON "shipment_containers" ("container_number")`,
    );

    // ---- tracking_events ----------------------------------------------------
    await q.query(`
      CREATE TABLE "tracking_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shipment_id" uuid NOT NULL,
        "status" "shipment_status",
        "code" character varying(50) NOT NULL,
        "description" character varying(500) NOT NULL,
        "location_id" uuid,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "is_public" boolean NOT NULL DEFAULT true,
        "created_by_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_tracking_events" PRIMARY KEY ("id"),
        CONSTRAINT "fk_tracking_events_shipment_id" FOREIGN KEY ("shipment_id")
          REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "fk_tracking_events_location_id" FOREIGN KEY ("location_id")
          REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )`);
    await q.query(
      `CREATE INDEX "ix_tracking_events_shipment_time" ON "tracking_events" ("shipment_id", "occurred_at")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "tracking_events"`);
    await q.query(`DROP TABLE "shipment_containers"`);
    await q.query(`DROP TABLE "shipment_packages"`);
    await q.query(`DROP TABLE "shipments"`);
    await q.query(`DROP TABLE "carriers"`);
    await q.query(`DROP TABLE "locations"`);
    await q.query(`DROP TABLE "users"`);
    await q.query(`DROP TABLE "customers"`);
    await q.query(`DROP SEQUENCE "shipment_reference_seq"`);
    for (const t of [
      'package_type',
      'incoterm',
      'container_type',
      'load_type',
      'shipment_status',
      'user_role',
      'location_type',
      'transport_mode',
    ]) {
      await q.query(`DROP TYPE "${t}"`);
    }
  }
}
