import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1795478010236 implements MigrationInterface {
  name = 'InitialSchema1795478010236';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'OPERATOR', 'CUSTOMER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "version" integer NOT NULL DEFAULT '1', "email" character varying(255) NOT NULL, "password_hash" character varying(255) NOT NULL, "full_name" character varying(150) NOT NULL, "role" "public"."user_role" NOT NULL DEFAULT 'CUSTOMER', "customer_id" uuid, "is_active" boolean NOT NULL DEFAULT true, "last_login_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_users_email" ON "users" ("email") `);
    await queryRunner.query(
      `CREATE TABLE "customer_refs" ("id" uuid NOT NULL, "source_version" integer NOT NULL, "synced_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "code" character varying(20) NOT NULL, "is_active" boolean NOT NULL, CONSTRAINT "PK_4ae523619384fe5fe7980f4e32f" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "customer_refs"`);
    await queryRunner.query(`DROP INDEX "public"."uq_users_email"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."user_role"`);
  }
}
