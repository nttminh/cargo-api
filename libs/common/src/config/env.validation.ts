import * as Joi from 'joi';

/**
 * Environment schemas, composed per service: every service validates only what it uses and
 * refuses to start when something required is missing.
 */
export const baseEnv = {
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api/v1'),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  API_DOCS_ENABLED: Joi.boolean().default(true),
};

export const jwtEnv = {
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('1h'),
};

export const dbEnv = {
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.boolean().default(false),
  DB_POOL_MAX: Joi.number().integer().min(1).default(10),
  DB_LOGGING: Joi.boolean().default(false),
  DB_RUN_MIGRATIONS: Joi.boolean().default(false),
};

export const kafkaEnv = {
  KAFKA_BROKERS: Joi.string().required(),
  KAFKA_CLIENT_ID: Joi.string().optional(),
  KAFKA_SSL: Joi.boolean().default(false),
  KAFKA_SASL_MECHANISM: Joi.string().valid('plain', 'scram-sha-256', 'scram-sha-512').optional(),
  KAFKA_SASL_USERNAME: Joi.string().when('KAFKA_SASL_MECHANISM', {
    is: Joi.exist(),
    then: Joi.required(),
  }),
  KAFKA_SASL_PASSWORD: Joi.string().when('KAFKA_SASL_MECHANISM', {
    is: Joi.exist(),
    then: Joi.required(),
  }),
  KAFKA_TOPIC_REPLICATION_FACTOR: Joi.number().integer().min(1).default(1),
  KAFKA_TOPIC_PARTITIONS: Joi.number().integer().min(1).default(3),
};

export const gatewayEnv = {
  CORS_ORIGINS: Joi.string().allow('').default(''),
  THROTTLE_TTL_MS: Joi.number().integer().min(1000).default(60000),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(120),
  IDENTITY_URL: Joi.string().uri().required(),
  MASTER_DATA_URL: Joi.string().uri().required(),
  SHIPMENTS_URL: Joi.string().uri().required(),
  UPSTREAM_TIMEOUT_MS: Joi.number().integer().min(1000).default(30000),
};

export const envSchema = (...parts: Record<string, Joi.Schema>[]) =>
  Joi.object(Object.assign({}, ...parts));
