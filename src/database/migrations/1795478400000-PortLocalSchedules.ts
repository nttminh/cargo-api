import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ETD/ETA become planned local times at the port: local wall-clock time + IANA zone, with the UTC
 * instant kept alongside for sorting and filtering. Every location must now have a time zone.
 */
export class PortLocalSchedules1795478400000 implements MigrationInterface {
  name = 'PortLocalSchedules1795478400000';

  public async up(q: QueryRunner): Promise<void> {
    // Refuse to guess a zone: a wrong one would silently shift every schedule at that port.
    await q.query(`
      DO $$
      DECLARE missing text;
      BEGIN
        SELECT string_agg("code", ', ') INTO missing FROM "locations" WHERE "timezone" IS NULL;
        IF missing IS NOT NULL THEN
          RAISE EXCEPTION 'Locations without a time zone: %. Set locations.timezone (IANA, e.g. Asia/Ho_Chi_Minh) and run the migration again.', missing;
        END IF;
      END $$;
    `);
    await q.query(`ALTER TABLE "locations" ALTER COLUMN "timezone" SET NOT NULL`);

    await q.query(`ALTER TABLE "shipments" RENAME COLUMN "etd" TO "etd_utc"`);
    await q.query(`ALTER TABLE "shipments" RENAME COLUMN "eta" TO "eta_utc"`);
    await q.query(`
      ALTER TABLE "shipments"
        ADD "etd_local" TIMESTAMP,
        ADD "etd_tz" character varying(64),
        ADD "eta_local" TIMESTAMP,
        ADD "eta_tz" character varying(64)
    `);

    // Existing values were stored as instants; express them in the port's local time.
    await q.query(`
      UPDATE "shipments" s
         SET "etd_tz" = l."timezone",
             "etd_local" = date_trunc('second', s."etd_utc" AT TIME ZONE l."timezone"),
             "etd_utc" = date_trunc('second', s."etd_utc")
        FROM "locations" l
       WHERE l."id" = s."origin_id" AND s."etd_utc" IS NOT NULL
    `);
    await q.query(`
      UPDATE "shipments" s
         SET "eta_tz" = l."timezone",
             "eta_local" = date_trunc('second', s."eta_utc" AT TIME ZONE l."timezone"),
             "eta_utc" = date_trunc('second', s."eta_utc")
        FROM "locations" l
       WHERE l."id" = s."destination_id" AND s."eta_utc" IS NOT NULL
    `);

    await q.query(`
      ALTER TABLE "shipments"
        ADD CONSTRAINT "chk_shipments_etd_complete"
          CHECK (("etd_local" IS NULL) = ("etd_tz" IS NULL) AND ("etd_local" IS NULL) = ("etd_utc" IS NULL)),
        ADD CONSTRAINT "chk_shipments_eta_complete"
          CHECK (("eta_local" IS NULL) = ("eta_tz" IS NULL) AND ("eta_local" IS NULL) = ("eta_utc" IS NULL))
    `);
    await q.query(`CREATE INDEX "ix_shipments_etd_utc" ON "shipments" ("etd_utc")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "ix_shipments_etd_utc"`);
    await q.query(`
      ALTER TABLE "shipments"
        DROP CONSTRAINT "chk_shipments_eta_complete",
        DROP CONSTRAINT "chk_shipments_etd_complete",
        DROP COLUMN "eta_tz",
        DROP COLUMN "eta_local",
        DROP COLUMN "etd_tz",
        DROP COLUMN "etd_local"
    `);
    await q.query(`ALTER TABLE "shipments" RENAME COLUMN "eta_utc" TO "eta"`);
    await q.query(`ALTER TABLE "shipments" RENAME COLUMN "etd_utc" TO "etd"`);
    await q.query(`ALTER TABLE "locations" ALTER COLUMN "timezone" DROP NOT NULL`);
  }
}
