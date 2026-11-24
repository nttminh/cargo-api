import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1795478014159 implements MigrationInterface {
  name = 'InitialSchema1795478014159';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "outbox" ("seq" BIGSERIAL NOT NULL, "topic" character varying(200) NOT NULL, "key" character varying(200) NOT NULL, "envelope" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "published_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_acf0725c6a7245b71c651964ee4" PRIMARY KEY ("seq"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_outbox_unpublished" ON "outbox" ("seq") WHERE "published_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "customers" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL DEFAULT '1', "code" character varying(20) NOT NULL, "company_name" character varying(200) NOT NULL, "contact_name" character varying(150), "email" character varying(255) NOT NULL, "phone" character varying(40), "tax_id" character varying(50), "address_line1" character varying(255), "address_line2" character varying(255), "city" character varying(100), "postal_code" character varying(20), "country_code" character varying(2) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_133ec679a801fab5e070f73d3ea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_customers_code" ON "customers" ("code") `);
    await queryRunner.query(`CREATE TYPE "public"."location_type" AS ENUM('AIRPORT', 'SEAPORT')`);
    await queryRunner.query(
      `CREATE TABLE "locations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL DEFAULT '1', "type" "public"."location_type" NOT NULL, "code" character varying(5) NOT NULL, "name" character varying(150) NOT NULL, "city" character varying(100) NOT NULL, "country_code" character varying(2) NOT NULL, "timezone" character varying(64) NOT NULL, "latitude" numeric(9,6), "longitude" numeric(9,6), "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_7cc1c9e3853b94816c094825e74" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_locations_type_code" ON "locations" ("type", "code") `,
    );
    await queryRunner.query(`CREATE TYPE "public"."transport_mode" AS ENUM('AIR', 'SEA')`);
    await queryRunner.query(
      `CREATE TABLE "carriers" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL DEFAULT '1', "mode" "public"."transport_mode" NOT NULL, "code" character varying(4) NOT NULL, "awb_prefix" character varying(3), "name" character varying(150) NOT NULL, "tracking_url_template" character varying(500), "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_fe886e72b3d9f67da3ce70f4368" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_carriers_mode_code" ON "carriers" ("mode", "code") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."uq_carriers_mode_code"`);
    await queryRunner.query(`DROP TABLE "carriers"`);
    await queryRunner.query(`DROP TYPE "public"."transport_mode"`);
    await queryRunner.query(`DROP INDEX "public"."uq_locations_type_code"`);
    await queryRunner.query(`DROP TABLE "locations"`);
    await queryRunner.query(`DROP TYPE "public"."location_type"`);
    await queryRunner.query(`DROP INDEX "public"."uq_customers_code"`);
    await queryRunner.query(`DROP TABLE "customers"`);
    await queryRunner.query(`DROP INDEX "public"."ix_outbox_unpublished"`);
    await queryRunner.query(`DROP TABLE "outbox"`);
  }
}
