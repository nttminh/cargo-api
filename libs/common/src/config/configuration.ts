const bool = (v: string | undefined, fallback = false) =>
  v === undefined ? fallback : ['true', '1', 'yes'].includes(v.toLowerCase());

const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** Typed view of the environment. Which parts are required is decided per service. */
export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  corsOrigins: list(process.env.CORS_ORIGINS),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  apiDocsEnabled: bool(process.env.API_DOCS_ENABLED, true),
  database: {
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
  upstreams: {
    identity: process.env.IDENTITY_URL,
    masterData: process.env.MASTER_DATA_URL,
    shipments: process.env.SHIPMENTS_URL,
    timeoutMs: parseInt(process.env.UPSTREAM_TIMEOUT_MS ?? '30000', 10),
  },
});
