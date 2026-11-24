import 'reflect-metadata';
import { DataSourceOptions } from 'typeorm';
import { join } from 'path';

const bool = (v: string | undefined) => ['true', '1', 'yes'].includes((v ?? '').toLowerCase());

export interface ServiceDataSourceOptions {
  /** Entity classes owned by the service (explicit list, so builds never depend on globs). */
  entities: NonNullable<DataSourceOptions['entities']>;
  /** Folder holding the service's migrations (pass __dirname-relative path). */
  migrationsDir: string;
}

/**
 * Connection options for one service's own database. Used by Nest (TypeOrmModule) and by the
 * TypeORM CLI, migrations and seed scripts. Every service reads the same DB_* variable names;
 * each deployment points them at that service's database.
 */
export const buildDataSourceOptions = (o: ServiceDataSourceOptions): DataSourceOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'cargo',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'cargo',
  ssl: bool(process.env.DB_SSL) ? { rejectUnauthorized: false } : false,
  logging: bool(process.env.DB_LOGGING),
  entities: o.entities,
  migrations: [join(o.migrationsDir, '*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  migrationsTransactionMode: 'each',
  synchronize: false,
  // gen_random_uuid() is built into PostgreSQL 13+, no extension needed.
  uuidExtension: 'pgcrypto',
  extra: {
    max: parseInt(process.env.DB_POOL_MAX ?? '10', 10),
    // Session time zone UTC, so now()/date_trunc and timestamptz text output never depend on
    // the database server's settings.
    options: '-c timezone=UTC',
  },
});
