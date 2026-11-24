import { ClassSerializerInterceptor, RequestMethod, Type, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import { serveServiceSpec } from '../docs/openapi';

export const HEALTH_ROUTES = [
  { path: 'health/live', method: RequestMethod.GET },
  { path: 'health/ready', method: RequestMethod.GET },
];

/** Global pipe shared by every service (and the e2e setup of each). */
export const validationPipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  });

/**
 * Starts a backend service. Services sit behind the gateway (CORS, rate limiting and the
 * public docs live there) but still validate input, verify tokens and set security headers.
 */
export async function bootstrapService(module: Type<unknown>, o: { name: string; title: string }) {
  const app = await NestFactory.create<NestExpressApplication>(module, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  app.set('trust proxy', true);
  app.disable('x-powered-by');

  const prefix = config.get<string>('apiPrefix', 'api/v1');
  app.setGlobalPrefix(prefix, { exclude: HEALTH_ROUTES });

  app.use(compression());
  app.use(helmet());
  app.useGlobalPipes(validationPipe());
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  if (config.get<boolean>('apiDocsEnabled')) serveServiceSpec(app, o.title);

  // SIGTERM from Kubernetes -> stop accepting connections, stop consumers, close DB pool, exit.
  app.enableShutdownHooks();

  const port = config.get<number>('port', 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`${o.name} listening on :${port}/${prefix}`, 'Bootstrap');
  return app;
}
