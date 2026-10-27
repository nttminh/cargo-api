import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { join } from 'path';

// Load .env when running the TypeORM CLI / seed outside Nest. No-op in containers
// (no .env file); real env vars always win.
loadEnv();

const bool = (v: string | undefined) => ['true', '1', 'yes'].includes((v ?? '').toLowerCase());

/**
 * Single source of truth for DB connection options.
 * Used by Nest (TypeOrmModule) and by the TypeORM CLI (migrations) / seed scripts.
 */
export const buildDataSourceOptions = (): DataSourceOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'cargo',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'cargo',
  ssl: bool(process.env.DB_SSL) ? { rejectUnauthorized: false } : false,
  logging: bool(process.env.DB_LOGGING),
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  migrationsTransactionMode: 'each',
  synchronize: false,
  // gen_random_uuid() is built into PostgreSQL 13+, no extension needed.
  uuidExtension: 'pgcrypto',
  extra: { max: parseInt(process.env.DB_POOL_MAX ?? '10', 10) },
});

export default new DataSource(buildDataSourceOptions());
