import '@cargo/common/time/force-utc';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { HEALTH_ROUTES } from '@cargo/common';
import { GatewayModule } from './gateway.module';
import { setupApiDocs } from './docs/api-docs';

async function bootstrap() {
  // No body parser: request bodies are streamed to the services untouched.
  const app = await NestFactory.create<NestExpressApplication>(GatewayModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  const config = app.get(ConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Behind an ingress / load balancer: trust X-Forwarded-* so req.ip and rate limiting work.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  const prefix = config.get<string>('apiPrefix', 'api/v1');
  app.setGlobalPrefix(prefix, { exclude: HEALTH_ROUTES });

  // Registered before helmet(): the docs page sets its own CSP for the Scalar bundle.
  if (config.get<boolean>('apiDocsEnabled')) setupApiDocs(app, prefix);
  app.use(helmet());
  const origins = config.get<string[]>('corsOrigins', []);
  app.enableCors({
    origin: origins.length ? origins : false,
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  // SIGTERM from Kubernetes -> stop accepting connections, finish in-flight requests, exit.
  app.enableShutdownHooks();

  const port = config.get<number>('port', 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`gateway listening on :${port}/${prefix}`, 'Bootstrap');
}

bootstrap();
