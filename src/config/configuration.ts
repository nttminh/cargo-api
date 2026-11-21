const bool = (v: string | undefined, fallback = false) =>
  v === undefined ? fallback : ['true', '1', 'yes'].includes(v.toLowerCase());

export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  apiDocsEnabled: bool(process.env.API_DOCS_ENABLED, true),
  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
    ssl: bool(process.env.DB_SSL),
    poolMax: parseInt(process.env.DB_POOL_MAX ?? '10', 10),
    logging: bool(process.env.DB_LOGGING),
    runMigrations: bool(process.env.DB_RUN_MIGRATIONS),
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
  },
});
