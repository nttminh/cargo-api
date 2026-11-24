import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1795478018241 implements MigrationInterface {
  name = 'InitialSchema1795478018241';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Global counter for human-readable shipment references (AIR-2611-000001).
    await queryRunner.query(`CREATE SEQUENCE "shipment_reference_seq" START 1`);
    await queryRunner.query(
      `CREATE TABLE "outbox" ("seq" BIGSERIAL NOT NULL, "topic" character varying(200) NOT NULL, "key" character varying(200) NOT NULL, "envelope" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "published_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_acf0725c6a7245b71c651964ee4" PRIMARY KEY ("seq"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_outbox_unpublished" ON "outbox" ("seq") WHERE "published_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "customer_refs" ("id" uuid NOT NULL, "source_version" integer NOT NULL, "synced_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "code" character varying(20) NOT NULL, "company_name" character varying(200) NOT NULL, "country_code" character varying(2) NOT NULL, "is_active" boolean NOT NULL, CONSTRAINT "PK_4ae523619384fe5fe7980f4e32f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE TYPE "public"."location_type" AS ENUM('AIRPORT', 'SEAPORT')`);
    await queryRunner.query(
      `CREATE TABLE "location_refs" ("id" uuid NOT NULL, "source_version" integer NOT NULL, "synced_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "type" "public"."location_type" NOT NULL, "code" character varying(5) NOT NULL, "name" character varying(150) NOT NULL, "city" character varying(100) NOT NULL, "country_code" character varying(2) NOT NULL, "timezone" character varying(64) NOT NULL, "latitude" numeric(9,6), "longitude" numeric(9,6), "is_active" boolean NOT NULL, CONSTRAINT "PK_d5502dc37e22aff137d5a18cef4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "ix_location_refs_code" ON "location_refs" ("code") `);
    await queryRunner.query(`CREATE TYPE "public"."transport_mode" AS ENUM('AIR', 'SEA')`);
    await queryRunner.query(
      `CREATE TABLE "carrier_refs" ("id" uuid NOT NULL, "source_version" integer NOT NULL, "synced_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "mode" "public"."transport_mode" NOT NULL, "code" character varying(4) NOT NULL, "name" character varying(150) NOT NULL, "awb_prefix" character varying(3), "is_active" boolean NOT NULL, CONSTRAINT "PK_ebc7d97e730b62b2817c00858b9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."package_type" AS ENUM('PALLET', 'CARTON', 'CRATE', 'DRUM', 'BAG', 'ROLL', 'PIECE', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "shipment_packages" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "shipment_id" uuid NOT NULL, "description" character varying(255) NOT NULL, "package_type" "public"."package_type" NOT NULL, "quantity" integer NOT NULL, "weight_kg" numeric(10,3) NOT NULL, "length_cm" numeric(8,2), "width_cm" numeric(8,2), "height_cm" numeric(8,2), "hs_code" character varying(12), "is_hazardous" boolean NOT NULL DEFAULT false, "un_number" character varying(6), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_shipment_packages_quantity" CHECK ("quantity" > 0 AND "weight_kg" > 0), CONSTRAINT "PK_da209a2085c414242164d4f78cd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_shipment_packages_shipment" ON "shipment_packages" ("shipment_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."container_type" AS ENUM('20GP', '40GP', '40HC', '45HC', '20RF', '40RF', '20OT', '40OT', '20FR', '40FR')`,
    );
    await queryRunner.query(
      `CREATE TABLE "shipment_containers" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "shipment_id" uuid NOT NULL, "container_number" character varying(11) NOT NULL, "container_type" "public"."container_type" NOT NULL, "seal_number" character varying(30), "tare_weight_kg" numeric(10,2), "vgm_kg" numeric(10,2), "temperature_c" numeric(5,2), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0ca94196495b071938dedcb1a22" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_shipment_containers_number" ON "shipment_containers" ("container_number") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_shipment_containers_number" ON "shipment_containers" ("shipment_id", "container_number") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."shipment_status" AS ENUM('DRAFT', 'BOOKED', 'RECEIVED', 'DEPARTED', 'IN_TRANSIT', 'ARRIVED', 'CUSTOMS_HOLD', 'CUSTOMS_CLEARED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "tracking_events" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "shipment_id" uuid NOT NULL, "status" "public"."shipment_status", "code" character varying(50) NOT NULL, "description" character varying(500) NOT NULL, "location_id" uuid, "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL, "is_public" boolean NOT NULL DEFAULT true, "created_by_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cc22ae68e05d9ba5a6575a6f429" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_tracking_events_shipment_time" ON "tracking_events" ("shipment_id", "occurred_at") `,
    );
    await queryRunner.query(`CREATE TYPE "public"."load_type" AS ENUM('FCL', 'LCL', 'LOOSE')`);
    await queryRunner.query(
      `CREATE TYPE "public"."incoterm" AS ENUM('EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP')`,
    );
    await queryRunner.query(
      `CREATE TABLE "shipments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL DEFAULT '1', "reference" character varying(20) NOT NULL, "mode" "public"."transport_mode" NOT NULL, "load_type" "public"."load_type" NOT NULL, "status" "public"."shipment_status" NOT NULL DEFAULT 'DRAFT', "customer_id" uuid NOT NULL, "shipper" jsonb NOT NULL, "consignee" jsonb NOT NULL, "notify_party" jsonb, "origin_id" uuid NOT NULL, "destination_id" uuid NOT NULL, "carrier_id" uuid, "incoterm" "public"."incoterm", "master_document_no" character varying(40), "house_document_no" character varying(40), "flight_number" character varying(10), "vessel_name" character varying(100), "voyage_number" character varying(20), "etd_local" TIMESTAMP, "etd_tz" character varying(64), "etd_utc" TIMESTAMP WITH TIME ZONE, "eta_local" TIMESTAMP, "eta_tz" character varying(64), "eta_utc" TIMESTAMP WITH TIME ZONE, "atd" TIMESTAMP WITH TIME ZONE, "ata" TIMESTAMP WITH TIME ZONE, "delivered_at" TIMESTAMP WITH TIME ZONE, "commodity_description" character varying(500) NOT NULL, "total_pieces" integer NOT NULL DEFAULT '0', "gross_weight_kg" numeric(12,3) NOT NULL DEFAULT '0', "volume_cbm" numeric(12,4) NOT NULL DEFAULT '0', "chargeable_weight_kg" numeric(12,3), "revenue_tons" numeric(12,3), "is_hazardous" boolean NOT NULL DEFAULT false, "declared_value" numeric(14,2), "currency" character varying(3), "special_instructions" text, "created_by_id" uuid, CONSTRAINT "chk_shipments_eta_complete" CHECK (("eta_local" IS NULL) = ("eta_tz" IS NULL) AND ("eta_local" IS NULL) = ("eta_utc" IS NULL)), CONSTRAINT "chk_shipments_etd_complete" CHECK (("etd_local" IS NULL) = ("etd_tz" IS NULL) AND ("etd_local" IS NULL) = ("etd_utc" IS NULL)), CONSTRAINT "chk_shipments_route" CHECK ("origin_id" <> "destination_id"), CONSTRAINT "PK_6deda4532ac542a93eab214b564" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_shipments_reference" ON "shipments" ("reference") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_shipments_master_doc" ON "shipments" ("master_document_no") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_shipments_house_doc" ON "shipments" ("house_document_no") `,
    );
    await queryRunner.query(`CREATE INDEX "ix_shipments_etd_utc" ON "shipments" ("etd_utc") `);
    await queryRunner.query(
      `CREATE INDEX "ix_shipments_mode_status" ON "shipments" ("mode", "status") `,
    );
    await queryRunner.query(`CREATE INDEX "ix_shipments_status" ON "shipments" ("status") `);
    await queryRunner.query(
      `CREATE INDEX "ix_shipments_customer_created" ON "shipments" ("customer_id", "created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "shipment_packages" ADD CONSTRAINT "fk_shipment_packages_shipment_id" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipment_containers" ADD CONSTRAINT "fk_shipment_containers_shipment_id" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tracking_events" ADD CONSTRAINT "fk_tracking_events_shipment_id" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tracking_events" DROP CONSTRAINT "fk_tracking_events_shipment_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipment_containers" DROP CONSTRAINT "fk_shipment_containers_shipment_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipment_packages" DROP CONSTRAINT "fk_shipment_packages_shipment_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_shipments_customer_created"`);
    await queryRunner.query(`DROP INDEX "public"."ix_shipments_status"`);
    await queryRunner.query(`DROP INDEX "public"."ix_shipments_mode_status"`);
    await queryRunner.query(`DROP INDEX "public"."ix_shipments_etd_utc"`);
    await queryRunner.query(`DROP INDEX "public"."ix_shipments_house_doc"`);
    await queryRunner.query(`DROP INDEX "public"."ix_shipments_master_doc"`);
    await queryRunner.query(`DROP INDEX "public"."uq_shipments_reference"`);
    await queryRunner.query(`DROP TABLE "shipments"`);
    await queryRunner.query(`DROP TYPE "public"."incoterm"`);
    await queryRunner.query(`DROP TYPE "public"."load_type"`);
    await queryRunner.query(`DROP INDEX "public"."ix_tracking_events_shipment_time"`);
    await queryRunner.query(`DROP TABLE "tracking_events"`);
    await queryRunner.query(`DROP TYPE "public"."shipment_status"`);
    await queryRunner.query(`DROP INDEX "public"."uq_shipment_containers_number"`);
    await queryRunner.query(`DROP INDEX "public"."ix_shipment_containers_number"`);
    await queryRunner.query(`DROP TABLE "shipment_containers"`);
    await queryRunner.query(`DROP TYPE "public"."container_type"`);
    await queryRunner.query(`DROP INDEX "public"."ix_shipment_packages_shipment"`);
    await queryRunner.query(`DROP TABLE "shipment_packages"`);
    await queryRunner.query(`DROP TYPE "public"."package_type"`);
    await queryRunner.query(`DROP TABLE "carrier_refs"`);
    await queryRunner.query(`DROP TYPE "public"."transport_mode"`);
    await queryRunner.query(`DROP INDEX "public"."ix_location_refs_code"`);
    await queryRunner.query(`DROP TABLE "location_refs"`);
    await queryRunner.query(`DROP TYPE "public"."location_type"`);
    await queryRunner.query(`DROP TABLE "customer_refs"`);
    await queryRunner.query(`DROP INDEX "public"."ix_outbox_unpublished"`);
    await queryRunner.query(`DROP TABLE "outbox"`);
    await queryRunner.query(`DROP SEQUENCE "shipment_reference_seq"`);
  }
}
